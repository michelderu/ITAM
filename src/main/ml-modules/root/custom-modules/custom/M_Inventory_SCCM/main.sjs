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

  // Get the source data
  let m_id = instance.PRODID0;

  let m_username = fn.lowerCase(instance.USER_NAME0);
  // If the username ends with '.dsk' or '.admin', remove it
  m_username = fn.replace(m_username, '.dsk', '');
  m_username = fn.replace(m_username, '.admin', '');

  // If the username is blank, administrator, or contains test, the topconsole user (without domain) must be used.
  if (m_username == '' || m_username == 'administrator' || m_username == 'test') {
    m_username = fn.substringAfter(instance.TOPCONSOLEUSER0, '/');
  }

  let m_publisher = instance.PUBLISHER0;
  let m_product = fn.replace(instance.DISPLAYNAME0, '_', ' ');
  
  // Determine major and minor versions
  let m_version = instance.VERSION0;
  let m_major = '';
  try {
    m_major = fn.replace(m_version, '^[. a-zA-Z]*([0-9]*)[\. ]([0-9]*).*', "$1"); // https://regexr.com/
  } catch {};
  let m_minor = '';
  try {
    m_minor = fn.replace(m_version, '^[. a-zA-Z]*([0-9]*)[\. ]([0-9]*).*', "$2"); // https://regexr.com/
  } catch {};
  
  let m_scan_date = null;
  try {
    m_scan_date = xs.date(xdmp.parseDateTime('[D]/[M]/[Y]', instance.LASTHWSCAN));
  } catch {};

  // Get install date, if it's empty, use timestamp for install date
  let m_install_date = null;
  try {
    m_install_date = xs.date(xdmp.parseDateTime('[Y0001][M01][D01]', instance.INSTALLDATE0));
  } catch {
    try {
      m_install_date = xs.date(xdmp.parseDateTime('[D]/[M]/[Y]', instance.TIMESTAMP));
    } catch {};
  };

  // Check the reference data for a relevant product
  let ref = null;
  let publisher = '';
  let product = '';
  let m_relevant = false;
  let match_rule = '';
  let refId = null;
  // Perform a smart search on the loopup data, relevance ordered, so we can break out the loop quickly!
  let products = cts.search(
    cts.andQuery([
      cts.collectionQuery('I_Relevant_Products'),
      cts.jsonPropertyWordQuery('PUBLISHER', fn.tokenize(m_publisher, ' '), ['case-insensitive']),
      cts.jsonPropertyWordQuery('PRODUCT', fn.tokenize(m_product, ' '), ['case-insensitive'])
    ])
  );
  for (ref of products) {
    publisher = ref.root.envelope.instance.PUBLISHER;
    product = ref.root.envelope.instance.PRODUCT;
    if (fn.contains(fn.lowerCase(m_publisher), fn.lowerCase(publisher)) && fn.contains(fn.lowerCase(m_product), fn.lowerCase(product))) {
      // There's a match on publisher and product
      m_relevant = true;
      match_rule = 'RELEVANT_PRODUCT: Match on publisher and product';
      refId = fn.baseUri(ref);
      // Now check if it shouldn't be excluded
      let exclude = fn.tokenize(ref.root.envelope.instance.EXCLUDE, '~');
      for (var e of exclude) {
        if (fn.contains(fn.lowerCase(m_product), fn.lowerCase(e))) {
          m_relevant = false;
          match_rule = 'EXCLUDED_PRODUCT: Match on publisher and product but product explicitly excluded';
          break;
        }
      }
      break;
    }
  }

  // Generate a unique docId
  let docId = '/Inventory_SCCM/' + sem.uuidString() + '.json';

  // Create the instance data
  instance = {
    "info" : {
      "title" : "Inventory_SCCM",
      "version" : "0.0.1",
      "baseUri" : "http://example.org/",
      "description" : "Intermediate view of inventory information based on the inventory data and relevant products"
    },
    "Inventory_SCCM": {
      "docid": docId,
      "id": m_id,
      "username": m_username,
      "publisher": m_publisher,
      "product": m_product,
      "version": m_version,
      "scan_date": m_scan_date,
      "install_date": m_install_date,
      "relevant": m_relevant,
      "ref_publisher": publisher,
      "ref_product": product,
      "major": m_major,
      "minor": m_minor
    }
  };

  ///////////////////////////////////////////////
  // BEGIN CUSTOM HEADER CODE FOR MAP_METERING //
  ///////////////////////////////////////////////

  headers = {
    "sources": {
      "name": "Inventory_SCCM",
      "raw": id,
      "reference": refId,
      "match_rule": match_rule
    },
    "createdOn": fn.currentDateTime(),
    "createdBy": xdmp.getCurrentUser(),
    "createdUsingMapping": "M_Inventory_SCCM"
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
