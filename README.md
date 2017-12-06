## Sumo Logic Datasource Plugin for Grafana
This plugin provide time series / table data from Sumo Logic.

### Notice
This plugin use Grafana unreleased feature.
To use this Feature, you need to build Grafana yourself, or wait for 4.7 release.
https://github.com/grafana/grafana/pull/9578

### Setup
This plugin use [Search Job API](https://help.sumologic.com/APIs/Search-Job-API).

You need to create Access Keys.
Please follow official document to create it.

https://help.sumologic.com/Manage/Security/Access-Keys

And then, please configure datasource like following.

Name | Description
------------ | -------------
URL | Specify the API Endpoint for your environment. (See also this [doc](https://help.sumologic.com/APIs/General-API-Information/Sumo-Logic-Endpoints-and-Firewall-Security))
Access | Specify "proxy".
Basic Auth | Check this to specify Access Keys.
Basic Auth Details | Specify created Access Keys.
Keep Cookies | To bypass Sumo Logic cookie to SumoLogic, please set "JSESSIONID,AWSELB"

![](https://raw.githubusercontent.com/mtanda/grafana-sumologic-datasource/master/dist/images/config.png)

To use without saving Access Keys in Grafana backend, you need to disable datasource Basic Auth, and Grafana itself Basic Auth in ini file.
When accessing datasoure proxy, auth dialog is appeared, input Access Keys, you can call API without saving Access Keys.

#### Limitation
- This plugin only work with proxy mode. (Sumo Logic API doesn't support CORS)
- This plugin doesn't support [Metrics API](https://help.sumologic.com/APIs/Metrics-API/About-Metrics-API).

#### Changelog

##### v1.0.0
- Initial release
