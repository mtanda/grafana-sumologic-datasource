import React, { PureComponent } from 'react';
import { DataSourceHttpSettings, InlineFormLabel, LegacyForms } from '@grafana/ui';
const { Input } = LegacyForms;
import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOption } from '@grafana/data';
import { SumologicOptions } from '../types';

export type Props = DataSourcePluginOptionsEditorProps<SumologicOptions>;

export class ConfigEditor extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
  }

  render() {
    const { options, onOptionsChange } = this.props;

    return (
      <>
        <DataSourceHttpSettings
          defaultUrl="https://api.sumologic.com/api"
          dataSourceConfig={options}
          onChange={onOptionsChange}
        />
        <h3 className="page-heading">SumoLogic Details</h3>
        <div className="gf-form-group">
          <div className="gf-form-inline">
            <div className="gf-form">
              <InlineFormLabel className="width-14">Query timeout</InlineFormLabel>
              <div className="width-30">
                <Input
                  className="width-30"
                  value={options.jsonData.timeout}
                  onChange={onUpdateDatasourceJsonDataOption(this.props, 'timeout')}
                />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
}
