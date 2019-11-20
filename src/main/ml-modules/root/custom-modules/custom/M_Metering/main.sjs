/*
  Copyright 2012-2019 MarkLogic Corporation

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

const DataHub = require("/data-hub/5/datahub.sjs");
const datahub = new DataHub();

function main(content, options) {

  //grab the doc id/uri
  let id = content.uri;

  //here we can grab and manipulate the context metadata attached to the document
  let context = content.context;

  //let's set our output format, so we know what we're exporting
  let outputFormat = options.outputFormat ? options.outputFormat.toLowerCase() : datahub.flow.consts.DEFAULT_FORMAT;

  //here we check to make sure we're not trying to push out a binary or text document, just xml or json
  if (outputFormat !== datahub.flow.consts.JSON && outputFormat !== datahub.flow.consts.XML) {
    datahub.debug.log({
      message: 'The output format of type ' + outputFormat + ' is invalid. Valid options are ' + datahub.flow.consts.XML + ' or ' + datahub.flow.consts.JSON + '.',
      type: 'error'
    });
    throw Error('The output format of type ' + outputFormat + ' is invalid. Valid options are ' + datahub.flow.consts.XML + ' or ' + datahub.flow.consts.JSON + '.');
  }

  /*
  This scaffolding assumes we obtained the document from the database. If you are inserting information, you will
  have to map data from the content.value appropriately and create an instance (object), headers (object), and triples
  (array) instead of using the flowUtils functions to grab them from a document that was pulled from MarkLogic.
  Also you do not have to check if the document exists as in the code below.

  Example code for using data that was sent to MarkLogic server for the document
  let instance = content.value;
  let triples = [];
  let headers = {};
   */

  //Here we check to make sure it's still there before operating on it
  if (!fn.docAvailable(id)) {
    datahub.debug.log({message: 'The document with the uri: ' + id + ' could not be found.', type: 'error'});
    throw Error('The document with the uri: ' + id + ' could not be found.')
  }

  //grab the 'doc' from the content value space
  let doc = content.value;

  // let's just grab the root of the document if its a Document and not a type of Node (ObjectNode or XMLNode)
  if (doc && (doc instanceof Document || doc instanceof XMLDocument)) {
    doc = fn.head(doc.root);
  }

  //get our instance, default shape of envelope is envelope/instance, else it'll return an empty object/array
  let instance = datahub.flow.flowUtils.getInstance(doc) || {};

  // get triples, return null if empty or cannot be found
  let triples = datahub.flow.flowUtils.getTriples(doc) || [];

  //gets headers, return null if cannot be found
  let headers = datahub.flow.flowUtils.getHeaders(doc) || {};

  //If you want to set attachments, uncomment here
  // instance['$attachments'] = doc;

  //insert code to manipulate the instance, triples, headers, uri, context metadata, etc.

    ////////////////////////////////////////////////
  // BEGIN CUSTOM MAPPING CODE FOR MAP_METERING //
  ////////////////////////////////////////////////

  // Create a unique ID
  let m_id = sem.uuidString();

  // Lookup process and publisher based on reference data
  let m_process = fn.lowerCase(instance.Processname);
  let ref = cts.search(
    cts.andQuery([
      cts.collectionQuery('I_Metering_Reference'),
      cts.jsonPropertyValueQuery('PROCESS', m_process, 'case-insensitive')
    ])
  );
  ref = fn.head(ref);
  let refId = ref ? fn.baseUri(ref) : null;
  let m_publisher = ref ? ref.xpath('//PUBLISHER') : '';
  let m_product = ref ? ref.xpath('//PRODUCT') : '';
  let m_relevant = ref ? true : false;

  // Determine major and minor versions
  let m_version = instance.Processversion;
  let m_major = '';
  try {
    m_major = fn.replace(m_version, '^[. a-zA-Z]*([0-9]*)[\. ]([0-9]*).*', "$1"); // https://regexr.com/
  } catch {};
  let m_minor = '';
  try {
    m_minor = fn.replace(m_version, '^[. a-zA-Z]*([0-9]*)[\. ]([0-9]*).*', "$2"); // https://regexr.com/
  } catch {};

  let m_computer = instance.Computername;
  let m_username = fn.lowerCase(instance.Username);

  // Convert the date to ISO date format
  let m_last_used = null;
  try {
    m_last_used = xs.date(xdmp.parseDateTime('[D]/[M]/[Y]', instance.LastUsage));
  } catch {};

  // Generate a unique docId
  let docId = '/Metering/' + sem.uuidString() + '.json';

  // Create the instance data
  instance = {
    "info" : {
      "title" : "Metering",
      "version" : "0.0.1",
      "baseUri" : "http://example.org/",
      "description" : "Canonical view of metering information"
    },
    "Metering": {
      "docid": docId,
      "id": m_id,
      "process": m_process,
      "publisher": m_publisher,
      "product": m_product,
      "version": m_version,
      "major": m_major,
      "minor": m_minor,
      "computer": m_computer,
      "username": m_username,
      "last_used": m_last_used,
      "relevant": m_relevant
    }
  };

  ///////////////////////////////////////////////
  // BEGIN CUSTOM HEADER CODE FOR MAP_METERING //
  ///////////////////////////////////////////////

  headers = {
    "sources": {
      "name": "Metering",
      "raw": id,
      "reference": refId
    },
    "createdOn": fn.currentDateTime(),
    "createdBy": xdmp.getCurrentUser(),
    "createdUsingMapping": "M_Metering"
  };

  ////////////////////////////////////////////////////
  // BEGIN CUSTOM ATTACHMENTS CODE FOR MAP_METERING //
  ////////////////////////////////////////////////////  

  //If you want to set attachments, uncomment here
  var attachments = new Array();
  attachments.push (doc);
  attachments.push (ref);
  instance['$attachments'] = attachments;

  //////////////////////////////////////////
  // SET THE CONTENT ID OF THE NEW ENTITY //
  //////////////////////////////////////////

  id = docId;

  ////////////////////////////////////////
  //  END CUSTOM CODE FOR MAP_METERING  //
  ////////////////////////////////////////

  //form our envelope here now, specifying our output format
  let envelope = datahub.flow.flowUtils.makeEnvelope(instance, headers, triples, outputFormat);

  //assign our envelope value
  content.value = envelope;

  //assign the uri we want, in this case the same
  content.uri = id;

  //assign the context we want
  content.context = context;

  //now let's return out our content to be written
  return content;
}

module.exports = {
  main: main
};
