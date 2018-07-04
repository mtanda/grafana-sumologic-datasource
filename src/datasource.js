import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import dateMath from 'app/core/utils/datemath';
import TableModel from 'app/core/table_model';
import { SumologicQuerier } from './querier';
import Observable from 'rxjs/Observable';


export class SumologicDatasource {
  constructor(instanceSettings, $q, backendSrv, templateSrv, timeSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.url = instanceSettings.url;
    this.basicAuth = instanceSettings.basicAuth;
    this.withCredentials = instanceSettings.withCredentials;
    this.timeoutSec = instanceSettings.jsonData.timeout || 30;
    this.$q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.timeSrv = timeSrv;
    this.fieldIndex = {
      tagKeys: new Set(),
      tagValues: {}
    };
    // Rate limiting, https://help.sumologic.com/APIs/Search-Job-API/About-the-Search-Job-API
    this.MAX_AVAILABLE_TOKEN = 4; // 4 api calls per second
    this.token = this.MAX_AVAILABLE_TOKEN;
    this.tokenTimer = null;
    this.excludeFieldList = [
      '_raw', '_collectorid', '_sourceid', '_messageid', '_messagecount', '_messagetime', '_receipttime',
      '_size', '_timeslice', 'processing_time_ms'
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

  query(options) {
    let self = this;
    let queries = _.chain(options.targets)
      .filter((target) => {
        return !target.hide && target.query;
      })
      .map((target) => {
        let params = {
          query: this.templateSrv.replace(this.stripComment(target.query), options.scopedVars),
          from: this.convertTime(options.range.from, false),
          to: this.convertTime(options.range.to, true),
          timeZone: 'Etc/UTC'
        };
        let adhocFilters = this.templateSrv.getAdhocFilters(this.name);
        if (adhocFilters.length > 0) {
          let filterQuery = ' | where ' + adhocFilters.map(f => {
            switch (f.operator) {
              case '=~':
                return f.key + ' ' + 'matches' + ' "' + f.value + '"';
              case '!~':
                return '!(' + f.key + ' ' + 'matches' + ' "' + f.value + '"' + ')';
              default:
                return f.key + ' ' + f.operator + ' "' + f.value + '"';
            }
          }).join(' and ');
          if (params.query.indexOf('|') === -1) {
            params.query += filterQuery;
          } else {
            params.query = params.query.replace(/\|/, filterQuery + ' |');
          }
        }
        return this.logQuery(params, target.format, true)
          .mergeMap(value => value)
          .scan((acc, one) => {
            acc.fields = one.fields;
            if (one.records) {
              acc.records = (acc.records || []).concat(one.records);
            } else if (one.messages) {
              acc.messages = (acc.messages || []).concat(one.messages);
            }
            return acc;
          }, {})
          .map((data) => {
            if (target.format === 'time_series_records') {
              return self.transformRecordsToTimeSeries(data, target, options.range.to.valueOf());
            }
            return data;
          });
      }).value();
    return Observable
      .combineLatest(queries)
      .map((responses) => {
        responses = responses.filter((r) => { return !_.isEmpty(r); });

        if (this.hasAdhocFilter()) {
          this.fieldIndex = {
            tagKeys: new Set(),
            tagValues: {}
          };

          // build fieldIndex
          responses.forEach(r => {
            r.fields.map(f => {
              return f.name;
            }).filter(name => {
              return !this.excludeFieldList.includes(name);
            }).forEach(name => {
              this.fieldIndex.tagKeys.add(name);
            });
          });

          responses.forEach(r => {
            (r.records || r.messages).forEach(d => {
              Object.keys(d.map).filter(tagKey => {
                return !this.excludeFieldList.includes(tagKey);
              }).forEach(tagKey => {
                if (!this.fieldIndex.tagValues[tagKey]) {
                  this.fieldIndex.tagValues[tagKey] = new Set();
                }
                this.fieldIndex.tagValues[tagKey].add(d.map[tagKey]);
              });
            });
          });
        }

        let tableResponses = _.chain(responses)
          .filter((response, index) => {
            return options.targets[index].format === 'records' || options.targets[index].format === 'messages';
          })
          .flatten()
          .value();

        if (tableResponses.length > 0) {
          return { data: [self.transformDataToTable(tableResponses)] };
        }
        return { data: responses.flatten() };
      });
  }

  metricFindQuery(query) {
    let range = this.timeSrv.timeRange();

    let recordValuesQuery = query.match(/^record_values\(([^,]+?),\s?([^\)]+?)\)/);
    if (recordValuesQuery) {
      let recordKey = recordValuesQuery[1].toLowerCase();
      let query = recordValuesQuery[2];
      let params = {
        query: this.templateSrv.replace(this.stripComment(query)),
        from: String(this.convertTime(range.from, false)),
        to: String(this.convertTime(range.to, true)),
        timeZone: 'Etc/UTC'
      };
      return this.logQuery(params, 'records', false).then((result) => {
        if (_.isEmpty(result)) {
          return [];
        }
        return result.records.map((r) => {
          return {
            text: r.map[recordKey],
            value: r.map[recordKey]
          };
        })
      });
    }
  }

  annotationQuery(options) {
    let annotation = options.annotation;
    let query = annotation.query || '';
    let tagKeys = annotation.tagKeys || '';
    tagKeys = tagKeys.split(',');
    let titleFormat = annotation.titleFormat || '';
    let textFormat = annotation.textFormat || '';

    if (!query) { return Promise.resolve([]); }

    let params = {
      query: this.templateSrv.replace(this.stripComment(query)),
      from: String(this.convertTime(options.range.from, false)),
      to: String(this.convertTime(options.range.to, true)),
      timeZone: 'Etc/UTC'
    };
    return this.logQuery(params, 'messages', false).then((result) => {
      if (_.isEmpty(result)) {
        return [];
      }

      let eventList = result.messages.map((message) => {
        let tags = _.chain(message.map)
          .filter((v, k) => {
            return _.includes(tagKeys, k);
          }).value();

        return {
          annotation: annotation,
          time: parseInt(message.map['_messagetime'], 10),
          title: this.renderTemplate(titleFormat, message.map),
          tags: tags,
          text: this.renderTemplate(textFormat, message.map)
        };
      });

      return eventList;
    });
  }

  testDatasource() {
    let params = {
      query: '| count _sourceCategory',
      from: (new Date()).getTime() - 10 * 60 * 1000,
      to: (new Date()).getTime(),
      timeZone: 'Etc/UTC'
    };
    return this.logQuery(params, 'records', false).then((response) => {
      return { status: 'success', message: 'Data source is working', title: 'Success' };
    });
  }

  logQuery(params, format, useObservable) {
    let querier = new SumologicQuerier(params, format, this.timeoutSec, useObservable, this, this.backendSrv);
    return querier.getResult();
  }

  transformDataToTable(data) {
    let table = new TableModel();

    if (data.length === 0) {
      return table;
    }

    let type = data[0].records ? 'records' : 'messages';

    let fields = _.chain(data)
      .map((d) => {
        return _.map(d.fields, 'name');
      })
      .flatten().uniq().value();

    // columns
    table.columns = fields.map((c) => {
      return { text: c, filterable: true };
    });

    // rows
    data.forEach((d) => {
      for (let r of d[type]) {
        let row = [];
        for (let key of fields) {
          row.push(r.map[key] || '');
        }
        table.rows.push(row);
      }
    });

    return table;
  }

  transformRecordsToTimeSeries(response, target, defaultValue) {
    let metricLabel = '';
    let dps = [];
    let fields = response.fields;
    let records = response.records;

    if (records.length === 0) {
      return { target: metricLabel, datapoints: dps };
    }

    let keyField = fields.find((f) => {
      return f.fieldType != 'string' && f.keyField;
    });
    keyField = keyField ? keyField.name : '';
    let valueField = fields.find((f) => {
      return f.fieldType != 'string' && !f.keyField;
    });
    if (!valueField) {
      return { target: metricLabel, datapoints: dps };
    }
    valueField = valueField.name;

    let result = {};
    records.sort((a, b) => {
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
    }).forEach((r) => {
      metricLabel = this.createMetricLabel(r.map, target);
      result[metricLabel] = result[metricLabel] || [];
      result[metricLabel].push([parseFloat(r.map[valueField]), parseFloat(r.map[keyField] || defaultValue)]);
    });

    return _.map(result, (v, k) => {
      return { target: k, datapoints: v };
    });
  }

  createMetricLabel(record, target) {
    if (_.isUndefined(target) || _.isEmpty(target.aliasFormat)) {
      return '';
    }

    return this.renderTemplate(this.templateSrv.replace(target.aliasFormat), record) || '{}';
  }

  renderTemplate(aliasPattern, aliasData) {
    var aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
    return aliasPattern.replace(aliasRegex, function (match, g1) {
      if (aliasData[g1]) {
        return aliasData[g1];
      }
      return g1;
    });
  }

  stripComment(query) {
    return query.split("\n").map(q => {
      return q.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');
    }).filter(q => {
      return q !== "";
    }).join("\n");
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

  getTagKeys(options) {
    return Promise.resolve(Array.from(this.fieldIndex.tagKeys).map(k => {
      return {
        type: 'key',
        text: k
      };
    }));
  }

  getTagValues(options) {
    return Promise.resolve(Array.from(this.fieldIndex.tagValues[options.key]).map(v => {
      return {
        type: 'value',
        text: v
      };
    }));
  }
}
