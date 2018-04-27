## Sumo Logic Datasource Plugin for Grafana
This plugin provide time series / table data from Sumo Logic.

### Install the plugin
To install the beta version, copy the `dist` directory of this repository to the plugin directory of your Grafana installation, then restart Grafana. Environment-specific instructions follow.


#### Install on Mac

To install the plugin on a Mac, with Grafana installed using Homebrew:

`cp -r dist /usr/local/var/lib/grafana/plugins/grafana-sumologic-datasource && brew services restart grafana`

#### Install on Ubuntu Linux

To install the plugin on Ubuntu Linux:

`sudo cp -r dist /path_to_plugins/grafana-sumologic-datasource && sudo /bin/systemctl restart grafana-server`

Where `path_to_plugins`  is the path to the plugins folder in your Grafana environment. The plugins folder is typically `/var/lib/grafana/`, but it may be different in your environment. 

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
Whitelisted Cookies | To bypass Sumo Logic cookie to SumoLogic, please set "JSESSIONID,AWSELB"

![](https://raw.githubusercontent.com/mtanda/grafana-sumologic-datasource/master/dist/images/config.png)

To use without saving Access Keys in Grafana backend, you need to disable datasource Basic Auth, and Grafana itself Basic Auth in ini file.
When accessing datasoure proxy, auth dialog is appeared, input Access Keys, you can call API without saving Access Keys.

### Query Sample
To test this datasource plugin, add Table panel and set following query.

`* | count by _sourceCategory`

Query for generating graph panel is a bit trickier (you have to use timeslice):

`* | timeslice by $__interval`

NOTE: `$__interval` is a grafana variable, it makes your time buckets adjust accordingly to the query timerange.
Of course you can use `timeslice` with a different argument if you wish.

#### Limitation
- This plugin only work with proxy mode. (Sumo Logic API doesn't support CORS)
- This plugin doesn't support [Metrics API](https://help.sumologic.com/APIs/Metrics-API/About-Metrics-API).

#### Changelog

##### v1.0.0
- Initial release
