'use strict';

System.register(['lodash', 'rxjs/Observable'], function (_export, _context) {
    "use strict";

    var _, Observable, _createClass, SumologicQuerier;

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    return {
        setters: [function (_lodash) {
            _ = _lodash.default;
        }, function (_rxjsObservable) {
            Observable = _rxjsObservable.default;
        }],
        execute: function () {
            _createClass = function () {
                function defineProperties(target, props) {
                    for (var i = 0; i < props.length; i++) {
                        var descriptor = props[i];
                        descriptor.enumerable = descriptor.enumerable || false;
                        descriptor.configurable = true;
                        if ("value" in descriptor) descriptor.writable = true;
                        Object.defineProperty(target, descriptor.key, descriptor);
                    }
                }

                return function (Constructor, protoProps, staticProps) {
                    if (protoProps) defineProperties(Constructor.prototype, protoProps);
                    if (staticProps) defineProperties(Constructor, staticProps);
                    return Constructor;
                };
            }();

            _export('SumologicQuerier', SumologicQuerier = function () {
                function SumologicQuerier(params, format, timeoutSec, useObservable, datasource, backendSrv) {
                    _classCallCheck(this, SumologicQuerier);

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

                _createClass(SumologicQuerier, [{
                    key: 'getResult',
                    value: function getResult() {
                        var _this = this;

                        this.startTime = new Date();
                        if (!this.useObservable) {
                            return this.delay(function () {
                                return _this.transition('CREATE_SEARCH_JOB');
                            }, Math.random() * 1000);
                        } else {
                            return Observable.defer(function () {
                                return _this.delay(function () {
                                    return _this.transition('CREATE_SEARCH_JOB');
                                }, Math.random() * 1000);
                            });
                        }
                    }
                }, {
                    key: 'transition',
                    value: function transition(state) {
                        this.state = state;
                        this.retryCount = 0;
                        if (!this.useObservable) {
                            return this.loop();
                        } else {
                            return this.loopForObservable();
                        }
                    }
                }, {
                    key: 'retry',
                    value: function retry() {
                        var _this2 = this;

                        this.retryCount += 1;
                        return this.delay(function () {
                            if (!_this2.useObservable) {
                                return _this2.loop();
                            } else {
                                return _this2.loopForObservable();
                            }
                        }, this.calculateRetryWait(1000, this.retryCount));
                    }
                }, {
                    key: 'loop',
                    value: function loop() {
                        var _this3 = this;

                        if (this.job) {
                            var now = new Date();
                            if (now - this.startTime > this.timeoutSec * 1000) {
                                return this.doRequest('DELETE', '/v1/search/jobs/' + this.job.data.id).then(function (result) {
                                    return Promise.reject({ message: 'timeout' });
                                });
                            }
                        }

                        switch (this.state) {
                            case 'CREATE_SEARCH_JOB':
                                return this.doRequest('POST', '/v1/search/jobs', this.params).then(function (job) {
                                    _this3.job = job;
                                    return _this3.transition('REQUEST_STATUS');
                                });
                                break;
                            case 'REQUEST_STATUS':
                                return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id).then(function (status) {
                                    _this3.status = status;
                                    if (_this3.status.data.state !== 'DONE GATHERING RESULTS') {
                                        if (_this3.retryCount < 20) {
                                            return _this3.retry();
                                        } else {
                                            return Promise.reject({ message: 'max retries exceeded' });
                                        }
                                    }

                                    if (!_.isEmpty(_this3.status.data.pendingErrors) || !_.isEmpty(_this3.status.data.pendingWarnings)) {
                                        return Promise.reject({ message: _this3.status.data.pendingErrors.concat(_this3.status.data.pendingWarnings).join('\n') });
                                    }
                                    return _this3.transition('REQUEST_RESULTS');
                                }).catch(function (err) {
                                    if (err.data && err.data.code && err.data.code === 'unauthorized') {
                                        return Promise.reject(err);
                                    }
                                    // need to wait until job is created and registered
                                    if (_this3.retryCount < 6 && err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                                        return _this3.retry();
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
                                    var limit = Math.min(this.maximumOffset, this.status.data.recordCount);
                                    return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + '/records?offset=0&limit=' + limit).then(function (response) {
                                        return response.data;
                                    });
                                } else if (this.format === 'messages') {
                                    if (this.status.data.messageCount === 0) {
                                        return Promise.resolve([]);
                                    }
                                    var _limit = Math.min(this.maximumOffset, this.status.data.messageCount);
                                    return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + '/messages?offset=0&limit=' + _limit).then(function (response) {
                                        return response.data;
                                    });
                                } else {
                                    return Promise.reject({ message: 'unsupported type' });
                                }
                                break;
                        }
                    }
                }, {
                    key: 'loopForObservable',
                    value: function loopForObservable() {
                        var _this4 = this;

                        if (this.job) {
                            var now = new Date();
                            if (now - this.startTime > this.timeoutSec * 1000) {
                                return this.doRequest('DELETE', '/v1/search/jobs/' + this.job.data.id).then(function (result) {
                                    return Promise.reject({ message: 'timeout' });
                                });
                            }
                        }

                        switch (this.state) {
                            case 'CREATE_SEARCH_JOB':
                                return this.doRequest('POST', '/v1/search/jobs', this.params).then(function (job) {
                                    _this4.job = job;
                                    return _this4.transition('REQUEST_STATUS');
                                });
                                break;
                            case 'REQUEST_STATUS':
                                return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id).then(function (status) {
                                    _this4.status = status;
                                    var prevMessageCount = _this4.messageCount;
                                    var prevRecordCount = _this4.RecordCount;
                                    _this4.messageCount = _this4.status.data.messageCount;
                                    _this4.recordCount = _this4.status.data.recordCount;

                                    if (!_.isEmpty(_this4.status.data.pendingErrors) || !_.isEmpty(_this4.status.data.pendingWarnings)) {
                                        return Promise.reject({ message: _this4.status.data.pendingErrors.concat(_this4.status.data.pendingWarnings).join('\n') });
                                    }

                                    if (_this4.status.data.state === 'DONE GATHERING RESULTS') {
                                        return _this4.transition('REQUEST_RESULTS');
                                    }

                                    if ((_this4.format === 'time_series_records' || _this4.format === 'records') && _this4.recordCount > prevRecordCount) {
                                        return _this4.transition('REQUEST_RESULTS');
                                    }
                                    if (_this4.format === 'messages' && _this4.messageCount > prevMessageCount) {
                                        return _this4.transition('REQUEST_RESULTS');
                                    }

                                    // wait for new result arrival
                                    return _this4.transition('REQUEST_STATUS');
                                }).catch(function (err) {
                                    if (err.data && err.data.code && err.data.code === 'unauthorized') {
                                        return Promise.reject(err);
                                    }
                                    // need to wait until job is created and registered
                                    if (_this4.retryCount < 6 && err.data && err.data.code && err.data.code === 'searchjob.jobid.invalid') {
                                        return _this4.retry();
                                    } else {
                                        return Promise.reject(err);
                                    }
                                });
                                break;
                            case 'REQUEST_RESULTS':
                                if (this.format === 'time_series_records' || this.format === 'records') {
                                    var limit = Math.min(this.maximumOffset, this.status.data.recordCount) - this.offset;
                                    return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + '/records?offset=' + this.offset + '&limit=' + limit).then(function (response) {
                                        _this4.offset += response.data.records.length;
                                        if (_this4.status.data.state === 'DONE GATHERING RESULTS' || _this4.offset >= _this4.maximumOffset) {
                                            return Observable.from([response.data]);
                                        }
                                        return Observable.from([response.data]).concat(Observable.defer(function () {
                                            return _this4.transition('REQUEST_STATUS');
                                        }).mergeMap(function (value) {
                                            return value;
                                        }));
                                    });
                                } else if (this.format === 'messages') {
                                    var _limit2 = Math.min(this.maximumOffset, this.status.data.messageCount) - this.offset;
                                    return this.doRequest('GET', '/v1/search/jobs/' + this.job.data.id + '/messages?offset=' + this.offset + '&limit=' + _limit2).then(function (response) {
                                        _this4.offset += response.data.messages.length;
                                        if (_this4.status.data.state === 'DONE GATHERING RESULTS' || _this4.offset >= _this4.maximumOffset) {
                                            return Observable.from([response.data]);
                                        }
                                        return Observable.from([response.data]).concat(Observable.defer(function () {
                                            return _this4.transition('REQUEST_STATUS');
                                        }).mergeMap(function (value) {
                                            return value;
                                        }));
                                    });
                                } else {
                                    return Promise.reject({ message: 'unsupported type' });
                                }
                                break;
                        }
                    }
                }, {
                    key: 'doRequest',
                    value: function doRequest(method, path, params) {
                        var _this5 = this;

                        if (this.datasource.token === 0) {
                            return this.delay(function () {
                                return _this5.doRequest(method, path, params);
                            }, Math.ceil(1000 / this.datasource.MAX_AVAILABLE_TOKEN));
                        }

                        var options = {
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
                            this.datasource.tokenTimer = setInterval(function () {
                                _this5.datasource.provideToken();
                            }, Math.ceil(1000 / this.datasource.MAX_AVAILABLE_TOKEN));
                        }

                        return this.backendSrv.datasourceRequest(options).catch(function (err) {
                            if (err.data && err.data.code && err.data.code === 'rate.limit.exceeded') {
                                _this5.datasource.token = 0;
                                return _this5.retryable(3, function (retryCount) {
                                    return _this5.delay(function () {
                                        return _this5.backendSrv.datasourceRequest(options);
                                    }, _this5.calculateRetryWait(1000, retryCount));
                                });
                            } else {
                                return Promise.reject(err);
                            }
                        });
                    }
                }, {
                    key: 'delay',
                    value: function delay(func, wait) {
                        return new Promise(function (resolve, reject) {
                            setTimeout(function () {
                                func().then(resolve, reject);
                            }, wait);
                        });
                    }
                }, {
                    key: 'retryable',
                    value: function retryable(retryCount, func) {
                        var promise = Promise.reject({}).catch(function () {
                            return func(retryCount);
                        });
                        for (var i = 0; i < retryCount; i++) {
                            (function (i) {
                                promise = promise.catch(function (err) {
                                    return func(i + 1);
                                });
                            })(i);
                        }
                        return promise;
                    }
                }, {
                    key: 'calculateRetryWait',
                    value: function calculateRetryWait(initialWait, retryCount) {
                        return initialWait * Math.min(10, Math.pow(2, retryCount)) + Math.floor(Math.random() * 1000);
                    }
                }]);

                return SumologicQuerier;
            }());

            _export('SumologicQuerier', SumologicQuerier);
        }
    };
});
//# sourceMappingURL=querier.js.map
