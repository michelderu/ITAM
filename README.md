# ITAM
This implementation ingests Inventory and Metering information in order to create a IT Asset Management dashboard, providing advise on improving Total Cost of Ownership.

## Prerequisites
- MarkLogic Server (https://developer.marklogic.com or https://hub.docker.com/_/marklogic)
- Data Hub Framework 5 (https://github.com/marklogic/marklogic-data-hub)

## Install MarkLogic
### Easiest option, using Docker Hub
```sh
docker run -d -it \
    -p 8000-8020:8000-8020 \
    -v `pwd`/MarkLogic:/var/opt/MarkLogic \
    -e MARKLOGIC_INIT=true \
    -e MARKLOGIC_ADMIN_USERNAME=admin \
    -e MARKLOGIC_ADMIN_PASSWORD=admin \
    --name ITAM \
    store/marklogicdb/marklogic-server:10.0-2-dev-centos
```
### Alternative option, install natively
Download the MarkLogic Server package from https://developer.marklogic.com.  
Now follow the installation instructions from https://docs.marklogic.com/guide/installation.

### Tail the logfiles
It can be helpful to put a tail on the logfile of the data hub as follows:
```sh
tail -f MarkLogic/Logs/8010_ErrorLog.txt
```

## Start Datahub Quickstart
```sh
java -jar marklogic-datahub-5.0.4.war
```

### Installation
Now point your browser to http://localhost:8080 and finish the installation using the ITAM project root directory (you might have to uninstall/re-install).

### Configure input folder paths for data to be ingested
In directory `flows` update the json documents so that all `inputFilePath` references reflect the correct folder in your setup.

### Run the ITAM analysis
First, click 'Settings' and turn of 'Flow tracing'. Or use the gradle command `gradle hubDisableTracing`.  
Now, click 'Flows' and start the flows.

## Tuning ingests
The Inventory data is around 280 MB. Let's suppose our machine can handle 6 threads comfortably. For `mlcp` to load the data as fast as possible, it would help to fully utilize the 6 threads. Let's calculate a sane split size based on that.  
280/6 = 46,6 MB. In this case, we'd have 6 splits of 46,6 MB all utilizing one thread in parallel. We can also devide up the data even further to lower it to below the default threshold of 32 MB. In this case, it would be sensible to run wit a split_size of 280/6/2 ~ 23 MB. This would mean the splits above 6 will be handled when the threads free up.
```sh
-split_input true
-thread_count 6
-max_split_size 24466773
```

### mlcp command Inventory
Based on 6 available threads: 280 MB / 6 / 2 * 1024 * 1024 = 24466773.
```sh
mlcp.sh import -mode "local" -host "localhost" -port "8010" -username "admin" -password "admin" -input_file_path "/Users/mderu/projects/ITAM/data/Inventory/Inventory" -input_file_type "delimited_text" -generate_uri "true" -delimiter ";" -output_collections "I_Inventory" -output_permissions "rest-reader,read,rest-writer,update" -document_type "json" -transform_module "/data-hub/5/transforms/mlcp-flow-transform.sjs" -transform_namespace "http://marklogic.com/data-hub/mlcp-flow-transform" -transform_param "flow-name=Inventory,step=2" -split_input "true" -thread_count "6" -max_split_size "24466773"
```

### mlcp command Reference Data
Based on 6 available threads: 7,7 MB / 6 * 1024 * 1024 = 1345672.
```sh
mlcp.sh import -mode "local" -host "localhost" -port "8010" -username "admin" -password "admin" -input_file_path "/Users/mderu/projects/ITAM/data/Inventory/Reference" -input_file_type "delimited_text" -generate_uri "true" -delimiter ";" -output_collections "I_Inventory_Reference" -output_permissions "rest-reader,read,rest-writer,update" -document_type "json" -transform_module "/data-hub/5/transforms/mlcp-flow-transform.sjs" -transform_namespace "http://marklogic.com/data-hub/mlcp-flow-transform" -transform_param "flow-name=Inventory,step=4" -split_input "true" -thread_count "6" -max_split_size "1345672"
```

## Tuning mapping steps
In the settings for flows, it is possible to define the Thread Count and Batch Size for the steps. Based on 6 available threads, set the Thread Count to 6. With the amound of documents to be processed, it could be wise to set the Batch Size to 1000. An other optimization step could be, depending on the requirements for provenance of course, could be to set the `provenanceGranularityLevel` to off.

## Tuning index settings

### Tuning Staging database index settings
Add these settings to `src/main/hub-internal-config/databases/staging-database.json` to lower the requirements for generic indexing providing around 13% performance increase.
```sh
  "stemmed-searches": "off",
  "word-searches": true,
  "word-positions": false,
  "fast-phrase-searches": false,
  "fast-case-sensitive-searches": true,
  "fast-diacritic-sensitive-searches": false,
  "fast-element-word-searches": true,
  "element-word-positions": false,
  "fast-element-phrase-searches": false,
  "element-value-positions": false
  ```

### Tuning Staging database for range indexes
Set some indexes on important elements/properties and use a range query in the code.
Easiest way to configure the .json files is to make an adjustment in the admin interface of MarkLogic and then find out the json structure using http://localhost:8002/manage/v2/ using `format=json`. Make sure to set the right collation to allow for case-insensitive matches. Range query used in the M_Inventory is https://docs.marklogic.com/cts.jsonPropertyRangeQuery.  
Range index set in `src/main/hub-internal-config/databases/staging-database.json`:
```sh
  "range-element-index": [
    {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/en/S1",
      "namespace-uri": "",
      "localname": "SCCM_PRODUCT_ID",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/en/S1",
      "namespace-uri": "",
      "localname": "SCCM_PUBLISHER",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/en/S1",
      "namespace-uri": "",
      "localname": "SCCM_PRODUCT",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/en/S1",
      "namespace-uri": "",
      "localname": "SCCM_VERSION",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }
  ]
  ```

## Ingesting contracts
In order to ingest and convert contracts to machine reabable (and therefore searchable) text, first the MarkLogic Converters need to be installed.
The installation packes can be found at https://developer.marklogic.com/products/marklogic-server/10.0 for your specific environment. Generic installation procedure to be found here: https://docs.marklogic.com/guide/installation/procedures#id_28962.

### Docker
In case of using the MarkLogic Docker image, you'll have to download and install the converters into the docker container like:
```sh
docker exec -it ITAM sh
curl --output /tmp/MarkLogicConverters.rpm <the url you get from developer.marklogic.com when clicking on the button to use Curl>
sudo yum install libgcc libgcc.i686 libstdc++ libstdc++.i686
sudo rpm -i /tmp/MarkLogicConverters.rpm
```

### Entity enrichment
To really get added value out of the unstructured documents, it is important to enrich the doucuments and find/name entities. In this case, we'll go searching for entities like Publisher and Product. In order to do this, we need a dictionary of relevant information, this dictionary can be created out of the Canonical Inventory entity. Following that, the entities can be found and enriched. All of this takes place in `src/main/ml-modules/root/custom-modules/custom/M_Contracts/main.sjs`.

## Connecting to a BI solution like Tableau or PowerBI
During installation of the Data Hub Framework an ODBC port has been configured on port 8014, linked to the data-hub-FINAL database. This allows for SQL over ODBC to query the database and it's generated Instances.  
For ODBC to work, the ODBC driver had to be downloaded and installed from http://develop.marklogic.com.  
After installation, point your favorite BI tool to a freshly created DSN and you're good to go. DSN settings as follows:
```sh
server: localhost
port: 8014
database: data-hub-FINAL
username: admin
password: ...
```

## Connecting to a Web Front End
We use GROVE for creating a Web Front End on top of the data-hub-FINAL database. GROVE is installed in the folder `ITAM-UI'.

### Install the supporting code into MarkLogic Server
```sh
cd ITAM-UI/marklogic
gradle mlDeploy
```

### Install the node dependencies
```sh
cd ITAM-UI
npm install
```

### Start Grove
```sh
cd ITAM-UI
npm start
```
And point your browser to http://localhost:3000

### Facetting
The facets within the ITAM-UI have been set up based on range indexes in the data-hub-FINAL database. For this the following range indexes had to be configured in `src/main/ml-config/databases/final-database.json`:
```sh
  "range-element-index": [
    {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/codepoint",
      "namespace-uri": "",
      "localname": "norm_publisher",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/codepoint",
      "namespace-uri": "",
      "localname": "norm_product",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/codepoint",
      "namespace-uri": "",
      "localname": "relevant",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "string",
      "collation": "http://marklogic.com/collation/codepoint",
      "namespace-uri": "",
      "localname": "license",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "int",
      "namespace-uri": "",
      "localname": "major",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }, {
      "scalar-type": "int",
      "namespace-uri": "",
      "localname": "minor",
      "range-value-positions": false,
      "invalid-values": "ignore"
    }
  ]
  ```
  Additionally, the following search options had to be defined in `ITAM-UI/marklogic/ml-modules/options/all.xml`:
  ```sh
    <constraint name="Publisher">
    <range type="xs:string" facet="true" collation="http://marklogic.com/collation/codepoint">
      <facet-option>limit=10</facet-option>
      <facet-option>frequency-order</facet-option>
      <facet-option>descending</facet-option>
      <element ns="" name="norm_publisher"/>
    </range>
  </constraint>
  
   <constraint name="Product">
    <range type="xs:string" facet="true" collation="http://marklogic.com/collation/codepoint">
      <facet-option>limit=10</facet-option>
      <facet-option>frequency-order</facet-option>
      <facet-option>descending</facet-option>
      <element ns="" name="norm_product"/>
    </range>
  </constraint>

  <constraint name="Relevant">
    <range type="xs:string" facet="true" collation="http://marklogic.com/collation/codepoint">
      <facet-option>limit=5</facet-option>
      <facet-option>frequency-order</facet-option>
      <facet-option>descending</facet-option>
      <element ns="" name="relevant"/>
    </range>
  </constraint>

  <constraint name="Licensable">
    <range type="xs:string" facet="true" collation="http://marklogic.com/collation/codepoint">
      <facet-option>limit=5</facet-option>
      <facet-option>frequency-order</facet-option>
      <facet-option>descending</facet-option>
      <element ns="" name="license"/>
    </range>
  </constraint>

  <constraint name="Major">
    <range type="xs:int" facet="true">
      <facet-option>limit=5</facet-option>
      <facet-option>frequency-order</facet-option>
      <facet-option>descending</facet-option>
      <element ns="" name="major"/>
    </range>
  </constraint>

  <constraint name="Minor">
    <range type="xs:int" facet="true">
      <facet-option>limit=5</facet-option>
      <facet-option>frequency-order</facet-option>
      <facet-option>descending</facet-option>
      <element ns="" name="minor"/>
    </range>
  </constraint>
```

### Workaround for security setting of Grove in combination with DHF
In `ITAM-UI/marklogic/build.gradle` comment out the following lines of code and upgrade the mlcp version to match MarkLogic Server:
```sh
mlcp "com.marklogic:mlcp:10.0.2"
//mlLoadSchemas.finalizedBy setSchemasPermissions
//mlDeploy.finalizedBy setSchemasPermissions
```