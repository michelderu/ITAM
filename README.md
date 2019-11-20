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

### Run the ITAM analysis
First, click 'Settings' and turn of 'Flow tracing'. Or use the gradle command `gradle hubDisableTracing`.
Now, click 'Flows' and start the flows.


