import _ from 'lodash';
import React from 'react';

import { QueryField, SlatePrism } from '@grafana/ui';
import { ExploreQueryFieldProps } from '@grafana/data';
import SumologicDatasource from '../datasource';
import { SumologicQuery, SumologicOptions } from '../types';

interface Props extends ExploreQueryFieldProps<SumologicDatasource, SumologicQuery, SumologicOptions> {}
interface State {
  syntaxLoaded: boolean;
}

class SumologicDatasourceQueryField extends React.PureComponent<Props, State> {
  plugins: any[];

  constructor(props: Props, context: React.Context<any>) {
    super(props, context);

    this.plugins = [
      SlatePrism({
        onlyIn: (node: any) => node.type === 'code_block',
        getSyntax: (node: any) => 'lucene',
      }),
    ];

    this.state = {
      syntaxLoaded: false,
    };
  }

  componentDidMount() {
    if (!(this.props.query.format === 'logs')) {
      this.onChangeQuery('', true);
    }
  }

  componentWillUnmount() {}

  componentDidUpdate(prevProps: Props) {
    // if query changed from the outside (i.e. cleared via explore toolbar)
    if (!(this.props.query.format === 'logs')) {
      this.onChangeQuery('', true);
    }
  }

  onChangeQuery = (value: string, override?: boolean) => {
    // Send text change to parent
    const { query, onChange, onRunQuery } = this.props;
    if (onChange) {
      const nextQuery: SumologicQuery = {
        ...query,
        query: value,
        format: 'logs',
      };
      onChange(nextQuery);

      if (override && onRunQuery) {
        onRunQuery();
      }
    }
  };

  render() {
    const { data, query } = this.props;
    const { syntaxLoaded } = this.state;

    return (
      <>
        <div className="gf-form-inline gf-form-inline--nowrap">
          <div className="gf-form gf-form--grow flex-shrink-1">
            <QueryField
              additionalPlugins={this.plugins}
              query={query.query}
              onChange={this.onChangeQuery}
              onRunQuery={this.props.onRunQuery}
              placeholder="Enter a query"
              portalOrigin="mtanda-sumologic-datasource"
              syntaxLoaded={syntaxLoaded}
            />
          </div>
        </div>
        {data && data.error ? <div className="prom-query-field-info text-error">{data.error.message}</div> : null}
      </>
    );
  }
}

export default SumologicDatasourceQueryField;
