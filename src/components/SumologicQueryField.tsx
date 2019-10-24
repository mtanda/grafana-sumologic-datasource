import _ from 'lodash';
import React from 'react';

import { Editor } from '@grafana/slate-react';
import { Value, Editor as CoreEditor } from 'slate';
import { makeValue } from '@grafana/ui';
import classnames from 'classnames';

// dom also includes Element polyfills
import { ExploreQueryFieldProps } from '@grafana/ui';
import SumologicDatasource from '../datasource';
import { SumologicQuery, SumologicOptions } from '../types';

export interface Props extends ExploreQueryFieldProps<SumologicDatasource, SumologicQuery, SumologicOptions> {}

interface State {
  value: Value;
}

export class SumologicQueryField extends React.PureComponent<Props, State> {
  plugins: any[];
  mounted: boolean;
  editor: Editor;

  constructor(props: Props, context: React.Context<any>) {
    super(props, context);

    this.plugins = [];

    this.state = {
      value: makeValue(props.query.query || ''),
    };
  }

  componentDidMount() {
    this.mounted = true;
    //if (!this.props.query.format === 'logs') {
    //  this.onChangeQuery('', true);
    //}
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  componentDidUpdate(prevProps: Props) {
    // if query changed from the outside (i.e. cleared via explore toolbar)
    //if (!this.props.query.format === 'logs') {
    //  this.onChangeQuery('', true);
    //}
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

  onKeyDown = (event: Event, editor: CoreEditor, next: Function) => {
    return next();
  };

  render() {
    const wrapperClassName = classnames('slate-query-field__wrapper', {
      'slate-query-field__wrapper--disabled': false,
    });
    return (
      <div className={wrapperClassName}>
        <div className="slate-query-field">
          <Editor
            ref={editor => (this.editor = editor)}
            autoCorrect={false}
            readOnly={false}
            onChange={this.onChangeQuery}
            onKeyDown={this.onKeyDown}
            placeholder="Enter a query"
            plugins={this.plugins}
            spellCheck={false}
            value={this.state.value}
          />
        </div>
      </div>
    );
  }
}
