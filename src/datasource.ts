import _ from 'lodash';
import dateMath from 'grafana/app/core/utils/datemath';
import TableModel from 'grafana/app/core/table_model';
import { SumologicQuerier } from './querier';
import { Observable, merge, of } from 'rxjs';
import { scan, map } from 'rxjs/operators';
import { DataSourceApi, DataSourceInstanceSettings, DataQueryRequest, DataQueryResponse, MetricFindValue } from '@grafana/data';
import { LoadingState, toDataFrame, FieldType, MutableDataFrame } from '@grafana/data';
import { SumologicQuery, SumologicOptions } from './types';

export default class SumologicDatasource extends DataSourceApi<SumologicQuery, SumologicOptions> {
  type: string;
  name: string;
  url: any;
  basicAuth: any;
  withCredentials: any;
  timeoutSec: number;
  $q: any;
  backendSrv: any;
  templateSrv: any;
  timeSrv: any;
  fieldIndex: any;
  MAX_AVAILABLE_TOKEN: number;
  token: number;
  tokenTimer: any;
  excludeFieldList: any;
  metaFields: any;

  /** @ngInject */
  constructor(instanceSettings: DataSourceInstanceSettings<SumologicOptions>, $q, backendSrv, templateSrv, timeSrv) {
    super(instanceSettings);
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.url = instanceSettings.url;
    this.basicAuth = instanceSettings.basicAuth;
    this.withCredentials = instanceSettings.withCredentials;
    this.timeoutSec = instanceSettings.jsonData.timeout || 180;
    this.$q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.timeSrv = timeSrv;
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
        const params = {
          query: this.templateSrv.replace(this.stripComment(target.query), options.scopedVars),
          from: this.convertTime(options.range.from, false),
          to: this.convertTime(options.range.to, true),
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
                data: [self.transformDataToTable(response)],
                //range: options.range
                unsubscribe: () => undefined,
              };
            } else if (target.format === 'logs') {
              return {
                key: `sumologic-${target.refId}`,
                state: response.done ? LoadingState.Done : LoadingState.Streaming,
                request: options,
                data: [self.transformDataToLogs(response)],
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
                    ? self.transformRecordsToTimeSeries(response, target, options.intervalMs, options.range.to.valueOf())
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
    const range = this.timeSrv.timeRange();

    const recordValuesQuery = query.match(/^record_values\(([^,]+?),\s?([^\)]+?)\)/);
    if (recordValuesQuery) {
      const recordKey = recordValuesQuery[1].toLowerCase();
      const query = recordValuesQuery[2];
      const params = {
        query: this.templateSrv.replace(this.stripComment(query)),
        from: String(this.convertTime(range.from, false)),
        to: String(this.convertTime(range.to, true)),
        timeZone: 'Etc/UTC',
      };
      const result = await this.logQuery(params, 'records');
      if (_.isEmpty(result)) {
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
      from: String(this.convertTime(options.range.from, false)),
      to: String(this.convertTime(options.range.to, true)),
      timeZone: 'Etc/UTC',
    };
    const result = await this.logQuery(params, 'messages');
    if (_.isEmpty(result)) {
      return [];
    }

    const eventList = result.messages.map(message => {
      const tags = _.chain(message.map)
        .filter((v, k) => {
          return _.includes(tagKeys, k);
        })
        .value();

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
      const querier = new SumologicQuerier(params, format, this.timeoutSec, this, this.backendSrv);
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
    const querier = new SumologicQuerier(params, format, this.timeoutSec, this, this.backendSrv);
    return querier.getResultObservable();
  }

  transformDataToTable(data) {
    const table = new TableModel();
    const type = data.records ? 'records' : 'messages';
    const fields = _.uniq(_.map(data.fields, 'name'))
      .filter(f => !this.metaFields.includes(f))
      .sort();
    const allFields = fields.concat(this.metaFields);

    // columns
    table.columns = allFields.map(c => {
      return { text: c, filterable: true };
    });

    // rows
    for (const r of data[type]) {
      const row: any[] = [];
      for (const key of allFields) {
        row.push(r.map[key] || '');
      }
      table.rows.push(row);
    }

    return toDataFrame(table);
  }

  transformDataToLogs(data) {
    const series = new MutableDataFrame({ fields: [] });

    const fields = _.uniq(_.map(data.fields, 'name'))
      .filter(f => !this.metaFields.includes(f))
      .sort();
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

    for (const r of data.messages) {
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
        metricLabel = this.createMetricLabel(_.extend(r.map, { field: valueField }), target);
        result[metricLabel] = result[metricLabel] || [];
        const timestamp = parseFloat(r.map[keyField] || defaultValue);
        const len = result[metricLabel].length;
        if (len > 0 && timestamp - result[metricLabel][len - 1][1] > intervalMs) {
          result[metricLabel].push([null, result[metricLabel][len - 1][1] + intervalMs]);
        }
        result[metricLabel].push([parseFloat(r.map[valueField]), timestamp]);
      });

      _.each(result, (v, k) => {
        timeSeries.push(toDataFrame({ target: k, datapoints: v }));
      });
    });
    return timeSeries;
  }

  createMetricLabel(record, target) {
    if (_.isUndefined(target) || _.isEmpty(target.aliasFormat)) {
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
        return q.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');
      })
      .filter(q => {
        return q !== '';
      })
      .join('\n');
  }

  convertTime(date, roundUp) {
    if (_.isString(date)) {
      date = dateMath.parse(date, roundUp);
    }
    return date.valueOf();
  }

  hasAdhocFilter() {
    return _.some(this.templateSrv.variables, variable => {
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
