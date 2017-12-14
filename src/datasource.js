import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import dateMath from 'app/core/utils/datemath';
import TableModel from 'app/core/table_model';

export class SumologicDatasource {
  constructor(instanceSettings, $q, backendSrv, templateSrv, timeSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.url = instanceSettings.url;
    this.basicAuth = instanceSettings.basicAuth;
    this.withCredentials = instanceSettings.withCredentials;
    this.$q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.timeSrv = timeSrv;
  }

  query(options) {
    let queries = _.map(options.targets, (target) => {
      let params = {
        query: this.templateSrv.replace(target.query, options.scopedVars),
        from: String(this.convertTime(options.range.from, false)),
        to: String(this.convertTime(options.range.to, true)),
        timeZone: 'Etc/UTC'
      };
      return this.logQuery(params, target.format)
    })

    return Promise.all(queries).then(responses => {
      let result = [];

      _.each(responses, (response, index) => {
        if (options.targets[index].format === 'time_series') {
          result.push(this.transformRecordsToTimeSeries(response.records, options.targets[index]));
        }
      });

      let tableResponses = _.filter(responses, (response, index) => {
        return options.targets[index].format === 'records'
          || options.targets[index].format === 'messages';
      }).flatten();
      if (tableResponses.length > 0) {
        result.push(this.transformDataToTable(tableResponses));
      }

      return { data: result };
    });
  }

  metricFindQuery(query) {
    let range = this.timeSrv.timeRange();

    let recordValuesQuery = query.match(/^record_values\(([^,]+?),\s?([^\)]+?)\)/);
    if (recordValuesQuery) {
      let recordKey = recordValuesQuery[1].toLowerCase();
      let query = recordValuesQuery[2];
      let params = {
        query: this.templateSrv.replace(query),
        from: String(this.convertTime(range.from, false)),
        to: String(this.convertTime(range.to, true)),
        timeZone: 'Etc/UTC'
      };
      return this.logQuery(params, 'records').then((result) => {
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
      query: this.templateSrv.replace(query),
      from: String(this.convertTime(options.range.from, false)),
      to: String(this.convertTime(options.range.to, true)),
      timeZone: 'Etc/UTC'
    };
    return this.logQuery(params, 'messages').then((result) => {
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
    return Promise.resolve({ status: 'success', message: 'Data source is working', title: 'Success' });
  }

  logQuery(params, format) {
    let timeoutSec = 30;
    let startTime = new Date();
    return this.doRequest('POST', '/search/jobs', params).then((job) => {
      let loop = () => {
        return this.doRequest('GET', '/search/jobs/' + job.data.id).then((status) => {
          let now = new Date();
          if (now - startTime > (timeoutSec * 1000)) {
            return this.doRequest('DELETE', '/search/jobs/' + job.data.id).then((result) => {
              return Promise.reject({ message: 'timeout' });
            });
          }

          if (status.data.state !== 'DONE GATHERING RESULTS') {
            return this.delay(loop, 1000);
          }


          if (format === 'time_series' || format === 'records') {
            if (status.data.recordCount === 0) {
              return Promise.resolve([]);
            }
            let limit = Math.min(10000, status.data.recordCount);
            return this.doRequest('GET', '/search/jobs/' + job.data.id + '/records?offset=0&limit=' + limit).then((response) => {
              return response.data;
            });
          } else if (format === 'messages') {
            if (status.data.messageCount === 0) {
              return Promise.resolve([]);
            }
            let limit = Math.min(10000, status.data.messageCount);
            return this.doRequest('GET', '/search/jobs/' + job.data.id + '/messages?offset=0&limit=' + limit).then((response) => {
              return response.data;
            });
          } else {
            return Promise.reject({ message: 'unsupported type' });
          }
        }).catch((err) => {
          // need to wait until job is created and registered
          if (err.data.code === 'searchjob.jobid.invalid') {
            return this.delay(loop, 1000);
          } else {
            return Promise.reject(err);
          }
        });
      };

      return this.delay(() => {
        return loop().then((result) => {
          return result;
        });
      }, 0);
    });
  }

  doRequest(method, path, params) {
    let options = {
      method: method,
      url: this.url + path,
      data: params,
      headers: {},
      inspect: { type: 'sumologic' }
    };

    if (this.basicAuth || this.withCredentials) {
      options.withCredentials = true;
    }
    if (this.basicAuth) {
      options.headers.Authorization = this.basicAuth;
    }
    options.headers['Content-Type'] = 'application/json';

    return this.backendSrv.datasourceRequest(options).catch((err) => {
      if (err.data.code === 'rate.limit.exceeded') {
        return this.delay(() => {
          return this.backendSrv.datasourceRequest(options);
        }, 5000);
      } else {
        return Promise.reject(err);
      }
    });
  }

  delay(func, wait) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        func().then(resolve, reject);
      }, wait);
    });
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
      return { text: c };
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

  transformRecordsToTimeSeries(records, target) {
    let metricLabel = '';
    let dps = [];

    if (records.length === 0) {
      return { target: metricLabel, datapoints: dps };
    }

    metricLabel = this.createMetricLabel(records[0].map, target);
    dps = records
      .map((r) => {
        return [parseFloat(r.map['_count']), parseInt(r.map['_timeslice'], 10)];
      })
      .sort((a, b) => {
        if (a[1] < b[1]) {
          return -1;
        } else if (a[1] > b[1]) {
          return 1;
        } else {
          return 0;
        }
      })

    return { target: metricLabel, datapoints: dps };
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

  convertTime(date, roundUp) {
    if (_.isString(date)) {
      date = dateMath.parse(date, roundUp);
    }
    return date.valueOf();
  }
}
