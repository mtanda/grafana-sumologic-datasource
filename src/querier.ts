import { Observable } from 'rxjs';
import {
  CreateSearchJobRequest,
  CreateSearchJobResponse,
  GetSearchJobStatusResponse,
  GetResultsResponse,
  BackendResponse,
} from './types';

export class SumologicQuerier {
  params: any;
  format: string;
  timeoutSec: number;
  datasource: any;
  backendSrv: any;
  offset: number;
  maximumOffset: number;
  maximumLimit: number;
  retryCount: number;
  loadRetryCount: number;
  messageCount: number;
  recordCount: number;
  status: any;

  /** @ngInject */
  constructor(params: CreateSearchJobRequest, format, timeoutSec, datasource, backendSrv) {
    this.params = params;
    this.format = format;
    this.timeoutSec = timeoutSec;
    this.datasource = datasource;
    this.backendSrv = backendSrv;
    this.offset = 0;
    this.maximumOffset = 10000;
    this.maximumLimit = 10000;
    this.retryCount = 6;
    this.loadRetryCount = 100;
    this.messageCount = 0;
    this.recordCount = 0;
  }

  getResultObservable() {
    const startTime = new Date();
    return new Observable(observer => {
      (async () => {
        let format = this.format.slice(0, -1); // strip last 's'
        if (this.format === 'time_series_records') {
          format = 'record';
        }
        if (this.format === 'logs') {
          format = 'message';
        }
        if (!['record', 'message'].includes(format)) {
          throw { message: 'unsupported type' };
        }

        await this.delay(Math.random() * 1000);
        let i;
        let job;
        for (i = 0; i < this.retryCount; i++) {
          try {
            job = await this.createSearchJob(this.params);
          } catch (err) {
            // ignore error
          }
          if (job.data && job.data.id) {
            break;
          }
          await this.delay(this.calculateRetryWait(1000, i));
          continue;
        }
        if (i === this.retryCount) {
          throw { job_id: job.data.id, message: 'max retries exceeded' };
        }

        while (true) {
          const now = new Date();
          if (now.valueOf() - startTime.valueOf() > this.timeoutSec * 1000) {
            console.error('timeout');
            this.deleteSearchJob(job.data.id);
            throw { job_id: job.data.id, message: 'timeout' };
          }

          let i;
          for (i = 0; i < this.retryCount; i++) {
            try {
              this.status = await this.getSearchJobStatus(job.data.id);
              const prevMessageCount = this.messageCount;
              const prevRecordCount = this.recordCount;
              this.messageCount = this.status.data.messageCount;
              this.recordCount = this.status.data.recordCount;

              if (this.status.data.pendingErrors.length > 0 || this.status.data.pendingWarnings.length > 0) {
                let message = '';
                if (this.status.data.pendingErrors.length > 0) {
                  message += 'Error:\n' + this.status.data.pendingErrors.join('\n') + '\n';
                }
                if (this.status.data.pendingWarnings.length > 0) {
                  message += 'Warning:\n' + this.status.data.pendingWarnings.join('\n');
                }
                console.error(message);
                if (
                  this.status.data.pendingWarnings[0] !==
                  'Messages may have been omitted from your results due to a regex that performs poorly against your data.'
                ) {
                  throw { job_id: job.data.id, message: message };
                }
              }

              if (this.status.data.state === 'DONE GATHERING RESULTS') {
                break;
              }

              if (
                (this.format === 'time_series_records' || this.format === 'records') &&
                this.recordCount > prevRecordCount
              ) {
                break;
              }
              if ((this.format === 'logs' || this.format === 'messages') && this.messageCount > prevMessageCount) {
                break;
              }

              // wait for new result arrival
              await this.delay(this.calculateRetryWait(1000, i));
              continue;
            } catch (err) {
              // need to wait until job is created and registered
              if (err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                await this.delay(this.calculateRetryWait(1000, i));
                continue;
              } else {
                this.deleteSearchJob(job.data.id);
                console.error(err);
                throw err;
              }
            }
          }
          if (i === this.retryCount) {
            this.deleteSearchJob(job.data.id);
            throw { job_id: job.data.id, message: 'max retries exceeded' };
          }

          for (i = 0; i < this.loadRetryCount; i++) {
            const limit = Math.min(this.maximumLimit, this.status.data[`${format}Count`] - this.offset);
            if (limit === 0) {
              try {
                this.deleteSearchJob(job.data.id);
              } catch (e) {
                // ignore error
              }
              observer.next({
                fields: [],
                records: [],
                done: true,
              });
              observer.complete();
              return;
            }
            try {
              const response = await this.getResults(job.data.id, format, this.offset, limit);
              this.offset += response.data[`${format}s`].length;
              if (this.offset >= Math.min(this.maximumOffset, this.status.data[`${format}Count`])) {
                try {
                  this.deleteSearchJob(job.data.id);
                } catch (e) {
                  // ignore error
                }
                response.data.done = true;
                observer.next(response.data);
                observer.complete();
                return;
              }
              observer.next(response.data);
            } catch (err) {
              if (err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                await this.delay(this.calculateRetryWait(1000, i));
                continue;
              } else {
                this.deleteSearchJob(job.data.id);
                console.error(err);
                throw err;
              }
            }
          }
          if (i === this.loadRetryCount) {
            this.deleteSearchJob(job.data.id);
            throw { job_id: job.data.id, message: 'max retries exceeded' };
          }
        }
      })();
    });
  }

  async createSearchJob(request: CreateSearchJobRequest): Promise<BackendResponse<CreateSearchJobResponse>> {
    return await this.doRequest('POST', '/v1/search/jobs', request);
  }

  async getSearchJobStatus(jobId: string): Promise<BackendResponse<GetSearchJobStatusResponse>> {
    return await this.doRequest('GET', `/v1/search/jobs/${jobId}`);
  }

  async getResults(
    jobId: string,
    format: string,
    offset: number,
    limit: number
  ): Promise<BackendResponse<GetResultsResponse>> {
    return await this.doRequest('GET', `/v1/search/jobs/${jobId}/${format}s?offset=${this.offset}&limit=${limit}`);
  }

  async deleteSearchJob(jobId: string) {
    return await this.doRequest('DELETE', `/v1/search/jobs/${jobId}`);
  }

  async doRequest(method, path, params = {}) {
    if (this.datasource.token === 0) {
      await this.delay(Math.ceil(1000 / this.datasource.MAX_AVAILABLE_TOKEN));
      return this.doRequest(method, path, params);
    }

    const options: any = {
      method: method,
      url: this.datasource.url + path,
      headers: {},
      inspect: { type: 'sumologic' },
      withCredentials: false,
    };
    if (method === 'POST') {
      options.data = params;
    }

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
      const response = await this.backendSrv.datasourceRequest(options);
      if (response.data.status && response.data.status === 404) {
        return Promise.reject(response);
      }
      return response;
    } catch (err) {
      if (err.data && err.data.code && err.data.code === 'rate.limit.exceeded') {
        this.datasource.token = 0;
        return await this.retryable(3, async retryCount => {
          await this.delay(this.calculateRetryWait(1000, retryCount));
          return this.backendSrv.datasourceRequest(options);
        }).catch(err => {
          console.error('rate limit exceeded');
          return err;
        });
      } else if (err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
        return Promise.reject(err);
      } else {
        console.error(err);
        return Promise.reject(err);
      }
    }
  }

  delay(msec) {
    return new Promise(resolve => setTimeout(resolve, msec));
  }

  async retryable(retryCount, func) {
    let promise = Promise.reject({}).catch(() => func(retryCount));
    for (let i = 0; i < retryCount; i++) {
      (i => {
        promise = promise.catch(err => func(i + 1));
      })(i);
    }
    return promise;
  }

  calculateRetryWait(initialWait, retryCount) {
    return initialWait * Math.min(10, Math.pow(2, retryCount)) + Math.floor(Math.random() * 1000);
  }
}
