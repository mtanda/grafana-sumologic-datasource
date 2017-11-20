import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import dateMath from 'app/core/utils/datemath';
import TableModel from 'app/core/table_model';

export class SumologicDatasource {
  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.url = instanceSettings.url;
    this.basicAuth = instanceSettings.basicAuth;
    this.withCredentials = instanceSettings.withCredentials;
    this.$q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
  }

  query(options) {
    let timeoutSec = 30;

    let queries = _.map(options.targets, (target) => {
      let params = {
        query: this.templateSrv.replace(target.query, options.scopedVars),
        from: String(this.convertTime(options.range.from, false)),
        to: String(this.convertTime(options.range.to, true)),
        timeZone: 'Etc/UTC'
      };
      let startTime = new Date();
      return this.doRequest('POST', '/search/jobs', params).then((job) => {
        if (job.status !== 202) {
          return this.$q.reject({ message: 'error' });
        }

        let loop = () => {
          return this.doRequest('GET', '/search/jobs/' + job.data.id).then((status) => {
            let now = new Date();
            if (now - startTime > (timeoutSec * 1000)) {
              return this.doRequest('DELETE', '/search/jobs/' + job.data.id).then((result) => {
                return this.$q.reject({ message: 'timeout' });
              });
            }

            if (status.data.state !== 'DONE GATHERING RESULTS') {
              return new Promise((resolve) => {
                setTimeout(() => {
                  loop().then(resolve);
                }, 1000);
              });
            }

            if (target.format === 'time_series' || target.format === 'records') {
              return this.doRequest('GET', '/search/jobs/' + job.data.id + '/records?offset=0&limit=10000').then((records) => {
                return records;
              });
            } else if (target.format === 'messages') {
              return this.doRequest('GET', '/search/jobs/' + job.data.id + '/messages?offset=0&limit=10000').then((messages) => {
                return messages;
              });
            } else {
                return this.$q.reject({ message: 'unsupported type' });
            }
          });
        };

        return loop().then((result) => {
          return result;
        });
      });
    })

    return this.$q.all(queries).then(responses => {
      let result = [];

      _.each(responses, (response, index) => {
        if (options.targets[index].format === 'time_series') {
          result.push(this.transformRecordsToTimeSeries(response.data.records, options.targets[index]));
        }
      });

      let tableResponses = _.filter(responses, (response, index) => {
        return options.targets[index].format === 'records'
          || options.targets[index].format === 'messages';
      })
      .map((response) => {
        return response.data;
      })
      .flatten();
      if (tableResponses.length > 0) {
        result.push(this.transformDataToTable(tableResponses));
      }

      return { data: result };
    });
  }

  testDatasource() {
    return this.$q.when({ status: 'success', message: 'Data source is working', title: 'Success' });
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
    let authorized = document.cookie.split('; ').find((c) => { return c.indexOf('AWSELB=') == 0 });
    if (!authorized && this.basicAuth) {
      options.headers.Authorization = this.basicAuth;
    }
    options.headers['Content-Type'] = 'application/json';

    return this.backendSrv.datasourceRequest(options).then((response) => {
      return response;
    }, (err) => {
      if (err.status === 401) {
        delete options.headers.Authorization;
        return this.backendSrv.datasourceRequest(options);
      } else {
        return err;
      }
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
    _.each(data, (d) => {
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
    _.each(records, (r) => {
      dps.push([parseFloat(r.map['_count']), parseInt(r.map['_timeslice'], 10)]);
    });
    dps = dps.sort((a, b) => {
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
