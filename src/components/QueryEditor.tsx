import React, { PureComponent } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { InlineFormLabel, QueryField, Select } from '@grafana/ui';
import { DataSource } from '../datasource';
import { SumologicQuery, SumologicOptions } from '../types';

type Props = QueryEditorProps<DataSource, SumologicQuery, SumologicOptions>;

const FORMAT_OPTIONS: Array<SelectableValue<string>> = [
  { label: 'Time series (Records)', value: 'time_series_records' },
  { label: 'Records', value: 'records' },
  { label: 'Messages', value: 'messages' },
  { label: 'Logs', value: 'logs' },
];

interface State {
  format: SelectableValue<string>;
  query: string;
  aliasFormat?: string;
}

export class QueryEditor extends PureComponent<Props, State> {
  query: SumologicQuery;

  constructor(props: Props) {
    super(props);
    const defaultQuery: Partial<SumologicQuery> = {
      format: 'time_series_records',
      query: '',
      aliasFormat: '',
    };
    const query = Object.assign({}, defaultQuery, props.query);
    this.query = query;
    this.state = {
      format: FORMAT_OPTIONS.find(option => option.value === query.format) || FORMAT_OPTIONS[0],
      query: query.query,
      aliasFormat: query.aliasFormat,
    };
  }

  onFormatChange = (option: SelectableValue<string>) => {
    this.query.format = option.value;
    this.setState({ format: option }, this.onRunQuery);
  };

  onQueryChange = (value: string, override?: boolean) => {
    const { query, onChange, onRunQuery } = this.props;
    const queryString = value;
    this.query.query = queryString;
    this.setState({ query: queryString });
    if (onChange) {
      onChange({ ...query, query: queryString });
      if (override && onRunQuery) {
        onRunQuery();
      }
    }
  };

  onAliasFormatChange = (event: React.SyntheticEvent<HTMLInputElement>) => {
    const { query, onChange, onRunQuery } = this.props;
    const aliasFormat = event.currentTarget.value;
    this.query.aliasFormat = aliasFormat;
    this.setState({ aliasFormat });
    if (onChange) {
      onChange({ ...query, aliasFormat: aliasFormat });
      if (onRunQuery) {
        onRunQuery();
      }
    }
  };

  onRunQuery = () => {
    const { query } = this;
    this.props.onChange(query);
    this.props.onRunQuery();
  };

  render() {
    const { format, query, aliasFormat } = this.state;
    return (
      <>
        <div className="gf-form-inline gf-form-inline--xs-view-flex-column flex-grow-1">
          <div className="gf-form">
            <div className="gf-form-label">Format</div>
            <Select isSearchable={false} options={FORMAT_OPTIONS} onChange={this.onFormatChange} value={format} />
          </div>

          <div className="gf-form gf-form--grow flex-shrink-1 min-width-15">
            <InlineFormLabel width={8}>Query</InlineFormLabel>
            <QueryField
              query={query}
              onBlur={this.props.onBlur}
              onChange={this.onQueryChange}
              onRunQuery={this.props.onRunQuery}
              portalOrigin="sumologic"
            />
          </div>
        </div>

        <div className="gf-form-inline">
          <div className="gf-form gf-form--grow flex-shrink-1 min-width-15">
            <InlineFormLabel width={8}>Alias Format</InlineFormLabel>
            <input
              type="text"
              className="gf-form-input"
              placeholder=""
              value={aliasFormat}
              onChange={this.onAliasFormatChange}
              onBlur={this.onRunQuery}
            />
          </div>
        </div>
      </>
    );
  }
}
