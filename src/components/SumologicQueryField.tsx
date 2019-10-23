import _ from 'lodash';
import React from 'react';

import { SlatePrism } from '@grafana/ui';
import { Editor } from '@grafana/slate-react';

// dom also includes Element polyfills
import { ExploreQueryFieldProps } from '@grafana/ui';
import SumologicDatasource from '../datasource';
import { SumologicQuery, SumologicOptions } from '../types';

export interface Props extends ExploreQueryFieldProps<SumologicDatasource, SumologicQuery, SumologicOptions> { }

interface State {
}

export class SumologicQueryField extends React.PureComponent<Props, State> {
  plugins: any[];

  constructor(props: Props, context: React.Context<any>) {
    super(props, context);

    this.plugins = [
    ];

    this.state = {
    };
  }

  componentDidMount() {
    if (!this.props.query.format === 'logs') {
      this.onChangeQuery('', true);
    }
  }

  componentWillUnmount() { }

  componentDidUpdate(prevProps: Props) {
    // if query changed from the outside (i.e. cleared via explore toolbar)
    if (!this.props.query.format === 'logs') {
      this.onChangeQuery('', true);
    }
  }

  onChangeQuery = (value: string, override?: boolean) => {
    // Send text change to parent
    const { query, onChange, onRunQuery } = this.props;
    if (onChange) {
      const nextQuery: SumologicQuery = { ...query, query: value, format: 'logs' };
      onChange(nextQuery);

      if (override && onRunQuery) {
        onRunQuery();
      }
    }
  };

  render() {
    const { data, query } = this.props;

    return (
      <>
        <div className="gf-form-inline gf-form-inline--nowrap">
          <div className="gf-form gf-form--grow flex-shrink-1">
            <Editor
              autoCorrect={false}
              onChange={this.onChangeQuery}
              placeholder="Enter a query"
              plugins={this.plugins}
              spellCheck={false}
              value={query.query}
            />
          </div>
        </div>
        {data && data.error ? <div className="prom-query-field-info text-error"> data.error.message}</div> : null}
      </>
    );
  }
}
