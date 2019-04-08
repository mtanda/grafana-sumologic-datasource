import _ from 'lodash';
import { Observable } from 'rxjs';
import 'rxjs/add/observable/empty';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/defer';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/mergeMap';

export class SumologicQuerier {
    params: any;
    format: string;
    timeoutSec: number;
    useObservable: boolean;
    datasource: any;
    backendSrv: any;
    retryCount: number;
    offset: number;
    maximumOffset: number;
    startTime: Date;
    state: string;
    job: any;
    status: any;
    messageCount: number;
    recordCount: number;

    constructor(params, format, timeoutSec, useObservable, datasource, backendSrv) {
        this.params = params;
        this.format = format;
        this.timeoutSec = timeoutSec;
        this.useObservable = useObservable;
        this.datasource = datasource;
        this.backendSrv = backendSrv;
        this.retryCount = 0;
        this.offset = 0;
        this.maximumOffset = 10000;
    }

    async getResult() {
        this.startTime = new Date();
        await this.delay(Math.random() * 1000);
        return this.transition('CREATE_SEARCH_JOB');
    }

    getResultObservable() {
        this.startTime = new Date();
        return Observable.defer(async () => {
            await this.delay(Math.random() * 1000);
            return this.transition('CREATE_SEARCH_JOB');
        });
    }

    transition(state) {
        this.state = state;
        this.retryCount = 0;
        if (!this.useObservable) {
            return this.loop();
        } else {
            return this.loopForObservable();
        }
    }

    async retry() {
        this.retryCount += 1;
        await this.delay(this.calculateRetryWait(1000, this.retryCount));
        if (!this.useObservable) {
            return await this.loop();
        } else {
            return await this.loopForObservable();
        }
    }

    async loop() {
        if (this.job) {
            let now = new Date();
            if (now.valueOf() - this.startTime.valueOf() > (this.timeoutSec * 1000)) {
                console.error('timeout');
                await this.doRequest('DELETE', '/v1/search/jobs/' + this.job.data.id);
                return Promise.reject({ message: 'timeout' });
            }
        }

        switch (this.state) {
            case 'CREATE_SEARCH_JOB':
                this.job = await this.doRequest('POST', '/v1/search/jobs', this.params);
                return this.transition('REQUEST_STATUS');
                break;
            case 'REQUEST_STATUS':
                try {
                    this.status = await this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id);
                    if (this.status.data.state !== 'DONE GATHERING RESULTS') {
                        if (this.retryCount < 20) {
                            return this.retry();
                        } else {
                            return Promise.reject({ message: 'max retries exceeded' });
                        }
                    }

                    if (!_.isEmpty(this.status.data.pendingErrors) || !_.isEmpty(this.status.data.pendingWarnings)) {
                        let message = '';
                        if (!_.isEmpty(this.status.data.pendingErrors)) {
                            message += 'Error:\n' + this.status.data.pendingErrors.join('\n') + '\n';
                        }
                        if (!_.isEmpty(this.status.data.pendingWarnings)) {
                            message += 'Warning:\n' + this.status.data.pendingWarnings.join('\n');
                        }
                        return Promise.reject({ message: message });
                    }
                    return this.transition('REQUEST_RESULTS');
                } catch (err) {
                    if (err.data && err.data.code && err.data.code === 'unauthorized') {
                        return Promise.reject(err);
                    }
                    // need to wait until job is created and registered
                    if (this.retryCount < 6 && err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                        return this.retry();
                    } else {
                        return Promise.reject(err);
                    }
                }
                break;
            case 'REQUEST_RESULTS':
                let format = this.format.slice(0, -1); // strip last 's'
                if (this.format === 'time_series_records') {
                    format = 'record';
                }
                if (!['record', 'message'].includes(format)) {
                    return Promise.reject({ message: 'unsupported type' });
                }

                if (this.status.data[`${format}Count`] === 0) {
                    return Promise.resolve([]);
                }
                let limit = Math.min(this.maximumOffset, this.status.data[`${format}Count`]);
                let response = await this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + `/${format}s?offset=0&limit=` + limit);
                return response.data;
                break;
        }
        return Promise.reject({ message: 'unexpected status' });
    }

    async loopForObservable() {
        if (this.job) {
            let now = new Date();
            if (now.valueOf() - this.startTime.valueOf() > (this.timeoutSec * 1000)) {
                console.error('timeout');
                await this.doRequest('DELETE', '/v1/search/jobs/' + this.job.data.id);
                return Observable.throw({ message: 'timeout' });
            }
        }

        switch (this.state) {
            case 'CREATE_SEARCH_JOB':
                this.job = await this.doRequest('POST', '/v1/search/jobs', this.params);
                return this.transition('REQUEST_STATUS');
                break;
            case 'REQUEST_STATUS':
                try {
                    this.status = await this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id);
                    let prevMessageCount = this.messageCount;
                    let prevRecordCount = this.recordCount;
                    this.messageCount = this.status.data.messageCount;
                    this.recordCount = this.status.data.recordCount;

                    if (!_.isEmpty(this.status.data.pendingErrors) || !_.isEmpty(this.status.data.pendingWarnings)) {
                        return Observable.throw({ message: this.status.data.pendingErrors.concat(this.status.data.pendingWarnings).join('\n') });
                    }

                    if (this.status.data.state === 'DONE GATHERING RESULTS') {
                        return this.transition('REQUEST_RESULTS');
                    }

                    if ((this.format === 'time_series_records' || this.format === 'records') && this.recordCount > prevRecordCount) {
                        return this.transition('REQUEST_RESULTS');
                    }
                    if (this.format === 'messages' && this.messageCount > prevMessageCount) {
                        return this.transition('REQUEST_RESULTS');
                    }

                    // wait for new result arrival
                    await this.delay(200);
                    return this.transition('REQUEST_STATUS');
                } catch (err) {
                    if (err.data && err.data.code && err.data.code === 'unauthorized') {
                        return Observable.throw(err);
                    }
                    // need to wait until job is created and registered
                    if (this.retryCount < 6 && err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                        return this.retry();
                    } else {
                        return Observable.throw(err);
                    }
                }
                break;
            case 'REQUEST_RESULTS':
                let format = this.format.slice(0, -1); // strip last 's'
                if (this.format === 'time_series_records') {
                    format = 'record';
                }
                if (!['record', 'message'].includes(format)) {
                    return Observable.throw({ message: 'unsupported type' });
                }

                let limit = Math.min(this.maximumOffset, this.status.data[`${format}Count`]) - this.offset;
                if (limit === 0) {
                    return Observable.empty();
                }
                try {
                    let response = await this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + `/${format}s?offset=` + this.offset + '&limit=' + limit);
                    this.offset += response.data[`${format}s`].length;
                    if (this.status.data.state === 'DONE GATHERING RESULTS' || this.offset >= this.maximumOffset) {
                        return Observable.from([response.data]);
                    }
                    return Observable.from([response.data])
                        .concat(
                            Observable.defer(() => {
                                return this.transition('REQUEST_STATUS');
                            }).mergeMap((value: any) => value)
                        );
                } catch (err) {
                    if (this.retryCount < 6 && err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                        return this.retry();
                    } else {
                        return Observable.throw(err);
                    }
                };
                break;
        }
        return Observable.throw({ message: 'unexpected status' });
    }

    async doRequest(method, path, params = {}) {
        if (this.datasource.token === 0) {
            await this.delay(Math.ceil(1000 / this.datasource.MAX_AVAILABLE_TOKEN));
            return this.doRequest(method, path, params);
        }

        let options: any = {
            method: method,
            url: this.datasource.url + path,
            data: params,
            headers: {},
            inspect: { type: 'sumologic' },
            withCredentials: false
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

        try {
            let response = await this.backendSrv.datasourceRequest(options);
            if (response.data.status && response.data.status === 404) {
                return Promise.reject(response);
            }
            return response;
        } catch (err) {
            if (err.data && err.data.code && err.data.code === 'rate.limit.exceeded') {
                this.datasource.token = 0;
                return await this.retryable(3, async (retryCount) => {
                    await this.delay(this.calculateRetryWait(1000, retryCount));
                    return this.backendSrv.datasourceRequest(options);
                }).catch((err) => {
                    console.error('rate limit exceeded');
                    return err;
                });
            } else if (err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                return Promise.reject(err);
            } else {
                console.error(err);
                return Promise.reject(err);
            }
        };
    }

    delay(msec) {
        return new Promise(resolve => setTimeout(resolve, msec));
    }

    async retryable(retryCount, func) {
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
