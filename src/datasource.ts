import _ from 'lodash';
import dateMath from 'grafana/app/core/utils/datemath';
import TableModel from 'grafana/app/core/table_model';
import { SumologicQuerier } from './querier';
import { scan, map } from 'rxjs/operators';
import { DataSourceApi, DataSourceInstanceSettings, DataQueryRequest, DataStreamObserver, MetricFindValue } from '@grafana/ui';
import { LoadingState, toDataFrame } from '@grafana/data';
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
      'processing_time_ms',
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

  query(options: DataQueryRequest<SumologicQuery>, observer: DataStreamObserver): Promise<{ data: any }> {
    const self = this;
    const queries = _.chain(options.targets)
      .filter(target => {
        return !target.hide && !!target.query;
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
            return acc;
          }, {})
        );
      })
      .value();

    queries[0]
      .pipe(
        map((responses: any) => {
          responses = [responses];
          responses = responses.filter(r => {
            return !_.isEmpty(r);
          });

          if (this.hasAdhocFilter()) {
            this.fieldIndex = {
              tagKeys: new Set(),
              tagValues: {},
            };

            // build fieldIndex
            responses.forEach(r => {
              r.fields
                .map(f => {
                  return f.name;
                })
                .filter(name => {
                  return !this.excludeFieldList.includes(name);
                })
                .forEach(name => {
                  this.fieldIndex.tagKeys.add(name);
                });
            });

            responses.forEach(r => {
              (r.records || r.messages).forEach(d => {
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
            });
          }

          const tableResponses = _.chain(responses)
            .filter((response, index) => {
              return options.targets[index].format === 'records' || options.targets[index].format === 'messages';
            })
            .flatten()
            .value();

          if (tableResponses.length > 0) {
            return {
              key: `sumologic-table`,
              state: LoadingState.Done,
              request: options,
              data: [self.transformDataToTable(tableResponses)],
              //range: options.range
              unsubscribe: () => undefined,
            };
          } else {
            return {
              key: `sumologic-time-series`,
              state: LoadingState.Done,
              request: options,
              data: _.flatten(
                responses.map((response, index) => {
                  if (options.targets[index].format === 'time_series_records') {
                    return self.transformRecordsToTimeSeries(response, options.targets[index], options.intervalMs, options.range.to.valueOf());
                  }
                  return response;
                })
              ),
              //range: options.range,
              unsubscribe: () => undefined,
            };
          }
        })
      )
      .subscribe({
        next: state => observer(state),
      });

    return this.$q.when({ data: [] }) as Promise<{ data: any }>;
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
      query: '| count _sourceCategory',
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

  async logQuery(params, format) {
    const querier = new SumologicQuerier(params, format, this.timeoutSec, this, this.backendSrv);
    return await querier.getResult();
  }

  logQueryObservable(params, format) {
    const querier = new SumologicQuerier(params, format, this.timeoutSec, this, this.backendSrv);
    return querier.getResultObservable();
  }

  transformDataToTable(data) {
    const table = new TableModel();

    if (data.length === 0) {
      return toDataFrame(table);
    }

    const type = data[0].records ? 'records' : 'messages';

    const fields = _.chain(data)
      .map(d => {
        return _.map(d.fields, 'name');
      })
      .flatten()
      .uniq()
      .value();

    // columns
    table.columns = fields.map(c => {
      return { text: c, filterable: true };
    });

    // rows
    data.forEach(d => {
      for (const r of d[type]) {
        const row: any[] = [];
        for (const key of fields) {
          row.push(r.map[key] || '');
        }
        table.rows.push(row);
      }
    });

    return toDataFrame(table);
  }

  transformRecordsToTimeSeries(response, target, intervalMs, defaultValue) {
    let metricLabel = '';
    const dps = [];
    const fields = response.fields;
    let records = response.records;

    if (records.length === 0) {
      return toDataFrame({ target: metricLabel, datapoints: dps });
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

    const timeSeries = [] as object[];

    if (valueFields.length === 0) {
      return toDataFrame({ target: metricLabel, datapoints: dps });
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
