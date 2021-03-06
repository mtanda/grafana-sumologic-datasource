import { SumologicQuerier } from './querier';
import { Observable, merge, of } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import {
  DataSourceApi,
  DataSourceInstanceSettings,
  DataQueryRequest,
  DataQueryResponse,
  MetricFindValue,
} from '@grafana/data';
import { LoadingState, toDataFrame, FieldType, MutableDataFrame } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { SumologicQuery, SumologicOptions, CreateSearchJobRequest } from './types';

export class DataSource extends DataSourceApi<SumologicQuery, SumologicOptions> {
  type: string;
  name: string;
  url: any;
  basicAuth: any;
  withCredentials: any;
  timeoutSec: number;
  backendSrv: any;
  templateSrv: any;
  fieldIndex: any;
  MAX_AVAILABLE_TOKEN: number;
  token: number;
  tokenTimer: any;
  excludeFieldList: any;
  metaFields: any;

  constructor(instanceSettings: DataSourceInstanceSettings<SumologicOptions>) {
    super(instanceSettings);
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.url = instanceSettings.url;
    this.basicAuth = instanceSettings.basicAuth;
    this.withCredentials = instanceSettings.withCredentials;
    this.timeoutSec = instanceSettings.jsonData.timeout || 180;
    this.backendSrv = getBackendSrv();
    this.templateSrv = getTemplateSrv();
    this.fieldIndex = {
      tagKeys: new Set<string>(),
      tagValues: {},
    };
    // Rate limiting, https://help.sumologic.com/APIs/Search-Job-API/About-the-Search-Job-API
    this.MAX_AVAILABLE_TOKEN = 4; // 4 api calls per second
    this.token = this.MAX_AVAILABLE_TOKEN;
    this.tokenTimer = null;
    this.excludeFieldList = [
      '_raw',
      '_collectorid',
      '_sourceid',
      '_messageid',
      '_messagecount',
      '_messagetime',
      '_receipttime',
      '_size',
      '_timeslice',
    ];
    this.metaFields = [
      '_messagetime',
      '_raw',
      '_receipttime',
      '_blockid',
      '_collector',
      '_collectorid',
      '_format',
      '_messagecount',
      '_messageid',
      '_size',
      '_source',
      '_sourcecategory',
      '_sourcehost',
      '_sourceid',
      '_sourcename',
      '_view',
    ];
  }

  provideToken() {
    if (this.token < this.MAX_AVAILABLE_TOKEN) {
      this.token += 1;
      if (this.token === this.MAX_AVAILABLE_TOKEN) {
        clearInterval(this.tokenTimer);
        this.tokenTimer = null;
      }
    }
  }

  query(options: DataQueryRequest<SumologicQuery>): Observable<DataQueryResponse> {
    const self = this;
    const subQueries = options.targets
      .filter(target => {
        return !target.hide && !!target.query && target.query.length > 0;
      })
      .map(target => {
        const params: CreateSearchJobRequest = {
          query: this.templateSrv.replace(this.stripComment(target.query), options.scopedVars),
          from: options.range.from.valueOf(),
          to: options.range.to.valueOf(),
          timeZone: 'Etc/UTC',
        };
        const adhocFilters = this.templateSrv.getAdhocFilters(this.name);
        if (adhocFilters.length > 0) {
          const filterQuery =
            ' | where ' +
            adhocFilters
              .map(f => {
                switch (f.operator) {
                  case '=~':
                    return f.key + ' ' + 'matches' + ' "' + f.value + '"';
                  case '!~':
                    return '!(' + f.key + ' ' + 'matches' + ' "' + f.value + '"' + ')';
                  default:
                    return f.key + ' ' + f.operator + ' "' + f.value + '"';
                }
              })
              .join(' and ');
          if (params.query.indexOf('|') === -1) {
            params.query += filterQuery;
          } else {
            params.query = params.query.replace(/\|/, filterQuery + ' |');
          }
        }
        return this.logQueryObservable(params, target.format).pipe(
          scan((acc: any, one: any) => {
            acc.fields = one.fields;
            if (one.records) {
              acc.records = (acc.records || []).concat(one.records);
            } else if (one.messages) {
              acc.messages = (acc.messages || []).concat(one.messages);
            }
            acc.done = !!one.done;
            return acc;
          }, {}),
          map((response: any) => {
            if (this.hasAdhocFilter()) {
              this.fieldIndex = {
                tagKeys: new Set(),
                tagValues: {},
              };

              // build fieldIndex
              response.fields
                .map(f => {
                  return f.name;
                })
                .filter(name => {
                  return !this.excludeFieldList.includes(name);
                })
                .forEach(name => {
                  this.fieldIndex.tagKeys.add(name);
                });

              (response.records || response.messages).forEach(d => {
                Object.keys(d.map)
                  .filter(tagKey => {
                    return !this.excludeFieldList.includes(tagKey);
                  })
                  .forEach(tagKey => {
                    if (!this.fieldIndex.tagValues[tagKey]) {
                      this.fieldIndex.tagValues[tagKey] = new Set();
                    }
                    this.fieldIndex.tagValues[tagKey].add(d.map[tagKey]);
                  });
              });
            }

            if (target.format === 'records' || target.format === 'messages') {
              return {
                key: `sumologic-${target.refId}`,
                state: response.done ? LoadingState.Done : LoadingState.Streaming,
                request: options,
                data: [self.transformToDataFrame(response)],
                //range: options.range
                unsubscribe: () => undefined,
              };
            } else if (target.format === 'logs') {
              return {
                key: `sumologic-${target.refId}`,
                state: response.done ? LoadingState.Done : LoadingState.Streaming,
                request: options,
                data: [self.transformToDataFrame(response)],
                //range: options.range
                unsubscribe: () => undefined,
              };
            } else {
              return {
                key: `sumologic-${target.refId}`,
                state: response.done ? LoadingState.Done : LoadingState.Streaming,
                request: options,
                data:
                  target.format === 'time_series_records'
                    ? self.transformRecordsToTimeSeries(
                        response,
                        target,
                        options.intervalMs,
                        options.range.to.valueOf()
                      )
                    : response,
                //range: options.range,
                unsubscribe: () => undefined,
              };
            }
          })
        );
      });
    if (subQueries.length === 0) {
      return of({
        data: [],
        state: LoadingState.Done,
      });
    }

    return merge(...subQueries);
  }

  async metricFindQuery(query) {
    const recordValuesQuery = query.match(/^record_values\(([^,]+?),\s?([^\)]+?)\)/);
    if (recordValuesQuery) {
      const recordKey = recordValuesQuery[1].toLowerCase();
      const query = recordValuesQuery[2];
      const params = {
        query: this.templateSrv.replace(this.stripComment(query)),
        from: parseInt(this.templateSrv.replace('$__from'), 10),
        to: parseInt(this.templateSrv.replace('$__to'), 10),
        timeZone: 'Etc/UTC',
      };
      const result = await this.logQuery(params, 'records');
      if (!result.records) {
        return [];
      }
      return result.records.map(r => {
        return {
          text: r.map[recordKey],
          value: r.map[recordKey],
        };
      });
    }
  }

  async annotationQuery(options) {
    const annotation = options.annotation;
    const query = annotation.query || '';
    let tagKeys = annotation.tagKeys || '';
    tagKeys = tagKeys.split(',');
    const titleFormat = annotation.titleFormat || '';
    const textFormat = annotation.textFormat || '';

    if (!query) {
      return Promise.resolve([]);
    }

    const params = {
      query: this.templateSrv.replace(this.stripComment(query)),
      from: options.range.from.valueOf(),
      to: options.range.to.valueOf(),
      timeZone: 'Etc/UTC',
    };
    const result = await this.logQuery(params, 'messages');
    if (!result.messages) {
      return [];
    }

    const eventList = result.messages.map(message => {
      const tags = Object.entries(message.map)
        .filter(e => {
          return tagKeys.includes(e[0]);
        })
        .map(e => e[1]);

      return {
        annotation: annotation,
        time: parseInt(message.map['_messagetime'], 10),
        title: this.renderTemplate(titleFormat, message.map),
        tags: tags,
        text: this.renderTemplate(textFormat, message.map),
      };
    });

    return eventList;
  }

  async testDatasource() {
    const params = {
      query: '_index=sumologic_volume',
      from: new Date().getTime() - 10 * 60 * 1000,
      to: new Date().getTime(),
      timeZone: 'Etc/UTC',
    };
    try {
      await this.logQuery(params, 'records');
      return { status: 'success', message: 'Data source is working', title: 'Success' };
    } catch (err) {
      return { status: 'error', message: 'Data source is not working', title: 'Error' };
    }
  }

  async logQuery(params, format): Promise<any> {
    return new Promise((resolve, reject) => {
      const querier = new SumologicQuerier(params, format, this.timeoutSec, this);
      return querier
        .getResultObservable()
        .pipe(
          scan((acc: any, one: any) => {
            acc.fields = one.fields;
            if (one.records) {
              acc.records = (acc.records || []).concat(one.records);
            } else if (one.messages) {
              acc.messages = (acc.messages || []).concat(one.messages);
            }
            acc.done = !!one.done;
            return acc;
          }, {})
        )
        .subscribe(
          value => {
            if (value.done) {
              resolve(value);
            }
          },
          error => {
            reject(error);
          }
        );
    });
  }

  logQueryObservable(params, format) {
    const querier = new SumologicQuerier(params, format, this.timeoutSec, this);
    return querier.getResultObservable();
  }

  transformToDataFrame(data) {
    const series = new MutableDataFrame({ fields: [] });
    const fields: string[] = Array.from(
      new Set(
        data.fields
          .map(d => d.name)
          .filter(f => !this.metaFields.includes(f))
          .sort()
      )
    );
    const allFields = fields.concat(this.metaFields);

    allFields.forEach(f => {
      if (f === '_messagetime' || f === '_receipttime') {
        series.addField({
          name: f,
          type: FieldType.time,
          //labels: r.map,
        }).parse = (v: any) => {
          return new Date(parseInt(v, 10)).toISOString();
        };
      } else {
        series.addField({
          name: f,
          type: FieldType.string,
          //labels: r.map,
        }).parse = (v: any) => {
          return v || '';
        };
      }
    });

    const type = data.records ? 'records' : 'messages';
    for (const r of data[type]) {
      series.add(r.map);
    }

    return series;
  }

  transformRecordsToTimeSeries(response, target, intervalMs, defaultValue) {
    const timeSeries = [] as object[];

    let metricLabel = '';
    const fields = response.fields;
    let records = response.records;

    if (records.length === 0) {
      return timeSeries;
    }

    let keyField = fields.find(f => {
      return f.fieldType !== 'string' && f.keyField;
    });
    keyField = keyField ? keyField.name : '';
    const valueFields = [] as string[];

    fields.forEach(f => {
      if (f.fieldType !== 'string' && !f.keyField) {
        valueFields.push(f.name);
      }
    });

    if (valueFields.length === 0) {
      return timeSeries;
    }

    records = records.sort((a, b) => {
      if (keyField === '') {
        return 0;
      }
      if (a.map[keyField] < b.map[keyField]) {
        return -1;
      } else if (a.map[keyField] > b.map[keyField]) {
        return 1;
      } else {
        return 0;
      }
    });

    valueFields.forEach(valueField => {
      const result = {};
      records.forEach(r => {
        metricLabel = this.createMetricLabel(Object.assign(r.map, { field: valueField }), target);
        result[metricLabel] = result[metricLabel] || [];
        const timestamp = parseFloat(r.map[keyField] || defaultValue);
        const len = result[metricLabel].length;
        if (len > 0 && timestamp - result[metricLabel][len - 1][1] > intervalMs) {
          result[metricLabel].push([null, result[metricLabel][len - 1][1] + intervalMs]);
        }
        result[metricLabel].push([parseFloat(r.map[valueField]), timestamp]);
      });

      for (const [k, v] of Object.entries(result)) {
        timeSeries.push(toDataFrame({ target: k, datapoints: v }));
      }
    });
    return timeSeries;
  }

  createMetricLabel(record, target) {
    if (target === undefined) {
      return '';
    }

    return this.renderTemplate(this.templateSrv.replace(target.aliasFormat), record) || '{}';
  }

  renderTemplate(aliasPattern, aliasData) {
    const aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
    return aliasPattern.replace(aliasRegex, (match, g1) => {
      if (aliasData[g1]) {
        return aliasData[g1];
      }
      return g1;
    });
  }

  stripComment(query) {
    return query
      .split('\n')
      .map(q => {
        return q.replace(/(\/\*([\s\S]*?)\*\/)/gm, '').replace(/([^:])(\/\/(.*)$)/gm, '$1');
      })
      .filter(q => {
        return q !== '';
      })
      .join('\n');
  }

  hasAdhocFilter() {
    return this.templateSrv.getVariables().some(variable => {
      return variable.type === 'adhoc';
    });
  }

  getTagKeys(options: any = {}): Promise<MetricFindValue[]> {
    const keys = Array.from(this.fieldIndex.tagKeys).map((k: string) => {
      return {
        text: k,
      };
    });
    return Promise.resolve(keys);
  }

  getTagValues(options: any = {}): Promise<MetricFindValue[]> {
    const values = Array.from(this.fieldIndex.tagValues[options.key]).map((v: string) => {
      return {
        text: v,
      };
    });
    return Promise.resolve(values);
  }
}
