import React from 'react';
import { ExploreQueryFieldProps } from '@grafana/ui';
// @ts-ignore
import Cascader from 'rc-cascader';

import SumologicDatasource from '../datasource';
import { SumologicQuery, SumologicOptions } from '../types';

export interface Props extends ExploreQueryFieldProps<SumologicDatasource, SumologicQuery, SumologicOptions> {}

export interface State {
  field: string;
}

export class SumologicQueryField extends React.PureComponent<Props, State> {
  state: State = { field: '' };

  async componentDidMount() {
    //const { datasource } = this.props;
    this.setState({});
  }

  componentDidUpdate(prevProps: Props) {}

  render() {
    //const { datasource } = this.props;

    return (
      <div className="gf-form-inline gf-form-inline--nowrap">
        <div className="gf-form flex-shrink-0"></div>
        <div className="flex-shrink-1 flex-flow-column-nowrap"></div>
      </div>
    );
  }
}
