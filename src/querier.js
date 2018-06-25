import _ from 'lodash';

export class SumologicQuerier {
    constructor(params, format, timeoutSec, datasource, backendSrv) {
        this.params = params;
        this.format = format;
        this.timeoutSec = timeoutSec;
        this.datasource = datasource;
        this.backendSrv = backendSrv;
        this.retryCount = 0;
    }

    getResult() {
        this.startTime = new Date();
        return this.delay(() => {
            return this.transition('CREATE_SEARCH_JOB');
        }, Math.random() * 1000);
    }

    transition(state) {
        this.state = state;
        this.retryCount = 0;
        return this.loop();
    }

    retry() {
        this.retryCount += 1;
        return this.delay(() => {
            return this.loop();
        }, this.calculateRetryWait(1000, this.retryCount));
    }

    loop() {
        if (this.job) {
            let now = new Date();
            if (now - this.startTime > (this.timeoutSec * 1000)) {
                return this.doRequest('DELETE', '/v1/search/jobs/' + this.job.data.id).then((result) => {
                    return Promise.reject({ message: 'timeout' });
                });
            }
        }

        switch (this.state) {
            case 'CREATE_SEARCH_JOB':
                return this.doRequest('POST', '/v1/search/jobs', this.params).then((job) => {
                    this.job = job;
                    return this.transition('REQUEST_STATUS');
                });
                break;
            case 'REQUEST_STATUS':
                return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id).then((status) => {
                    this.status = status;
                    if (this.status.data.state !== 'DONE GATHERING RESULTS') {
                        if (this.retryCount < 20) {
                            return this.retry();
                        } else {
                            return Promise.reject({ message: 'max retries exceeded' });
                        }
                    }

                    if (!_.isEmpty(this.status.data.pendingErrors) || !_.isEmpty(this.status.data.pendingWarnings)) {
                        return Promise.reject({ message: this.status.data.pendingErrors.concat(this.status.data.pendingWarnings).join('\n') });
                    }
                    return this.transition('REQUEST_RESULTS');
                }).catch((err) => {
                    if (err.data && err.data.code && err.data.code === 'unauthorized') {
                        return Promise.reject(err);
                    }
                    // need to wait until job is created and registered
                    if (this.retryCount < 6 && err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                        return this.retry();
                    } else {
                        return Promise.reject(err);
                    }
                });
                break;
            case 'REQUEST_RESULTS':
                if (this.format === 'time_series_records' || this.format === 'records') {
                    if (this.status.data.recordCount === 0) {
                        return Promise.resolve([]);
                    }
                    let limit = Math.min(10000, this.status.data.recordCount);
                    return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + '/records?offset=0&limit=' + limit).then((response) => {
                        return response.data;
                    });
                } else if (this.format === 'messages') {
                    if (this.status.data.messageCount === 0) {
                        return Promise.resolve([]);
                    }
                    let limit = Math.min(10000, this.status.data.messageCount);
                    return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + '/messages?offset=0&limit=' + limit).then((response) => {
                        return response.data;
                    });
                } else {
                    return Promise.reject({ message: 'unsupported type' });
                }
                break;
        }
    }

    doRequest(method, path, params) {
        if (this.datasource.token === 0) {
            return this.delay(() => {
                return this.doRequest(method, path, params);
            }, Math.ceil(1000 / this.datasource.MAX_AVAILABLE_TOKEN));
        }

        let options = {
            method: method,
            url: this.datasource.url + path,
            data: params,
            headers: {},
            inspect: { type: 'sumologic' }
        };

        if (this.datasource.basicAuth || this.datasource.withCredentials) {
            options.withCredentials = true;
        }
        if (this.datasource.basicAuth) {
            options.headers.Authorization = this.datasource.basicAuth;
        }
        options.headers['Content-Type'] = 'application/json';

        this.datasource.token--;
        if (this.datasource.tokenTimer === null) {
            this.datasource.tokenTimer = setInterval(() => {
                this.datasource.provideToken();
            }, Math.ceil(1000 / this.datasource.MAX_AVAILABLE_TOKEN));
        }

        return this.backendSrv.datasourceRequest(options).catch((err) => {
            if (err.data && err.data.code && err.data.code === 'rate.limit.exceeded') {
                this.datasource.token = 0;
                return this.retryable(3, (retryCount) => {
                    return this.delay(() => {
                        return this.backendSrv.datasourceRequest(options);
                    }, this.calculateRetryWait(1000, retryCount));
                });
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

    retryable(retryCount, func) {
        let promise = Promise.reject({}).catch(() => func(retryCount));
        for (let i = 0; i < retryCount; i++) {
            ((i) => {
                promise = promise.catch(err => func(i + 1));
            })(i);
        }
        return promise;
    }

    calculateRetryWait(initialWait, retryCount) {
        return initialWait * Math.min(10, Math.pow(2, retryCount)) +
            Math.floor(Math.random() * 1000);
    }
}
