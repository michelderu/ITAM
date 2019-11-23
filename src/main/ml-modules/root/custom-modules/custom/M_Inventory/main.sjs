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
  let m_id = instance.Inventory_SCCM.id;

  // Get the source data
  let m_username = fn.lowerCase(instance.Inventory_SCCM.username);
  let m_publisher = instance.Inventory_SCCM.publisher;
  let m_product = instance.Inventory_SCCM.product;
  let m_version = instance.Inventory_SCCM.version;
  let m_scan_date = instance.Inventory_SCCM.scan_date;
  let m_install_date = instance.Inventory_SCCM.install_date;
  let m_relevant = instance.Inventory_SCCM.relevant;
  let m_ref_publisher = instance.Inventory_SCCM.ref_publisher;
  let m_ref_product = instance.Inventory_SCCM.ref_product;
  let m_major = instance.Inventory_SCCM.major;
  let m_minor = instance.Inventory_SCCM.minor;

  let m_norm_publisher = '';
  let m_norm_product = '';
  let m_norm_edition = '';
  let m_license = false;

  let refId = null;
  let match_rule = '';

  // Ref_Products: Preferably if there is a full match on product id, publisher, product and version
  let ref = cts.search(
    cts.andQuery([
      cts.collectionQuery('I_Inventory_Reference'),
      cts.jsonPropertyRangeQuery('SCCM_PRODUCT_ID', '=', m_id, 'collation=http://marklogic.com/collation/en/S1'),
      cts.jsonPropertyRangeQuery('SCCM_PUBLISHER', '=', m_publisher, 'collation=http://marklogic.com/collation/en/S1'),
      cts.jsonPropertyRangeQuery('SCCM_PRODUCT', '=', m_product, 'collation=http://marklogic.com/collation/en/S1'),
      cts.jsonPropertyRangeQuery('SCCM_VERSION', '=', m_version, 'collation=http://marklogic.com/collation/en/S1')
    ])
  );
  if (!fn.empty(ref)) {
    ref = fn.head(ref);
    refId = fn.baseUri(ref);
    match_rule = 'Ref_Products: Match on product id, publisher, product and version';
    m_norm_publisher = ref.root.envelope.instance.NORM_PUBLISHER;
    m_norm_product = ref.root.envelope.instance.NORM_PRODUCT;
    m_norm_edition = ref.root.envelope.instance.NORM_EDITION;
    m_license = ref.root.envelope.instance.L == 'Y';
  }

  // UNQ_Publisher_Product_Version: Next if there is a match on publisher, product and version
  if (fn.empty(ref)) {
    ref = cts.search(
      cts.andQuery([
        cts.collectionQuery('I_Inventory_Reference'),
        cts.jsonPropertyRangeQuery('SCCM_PUBLISHER', '=', m_publisher, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyRangeQuery('SCCM_PRODUCT', '=', m_product, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyRangeQuery('SCCM_VERSION', '=', m_version, 'collation=http://marklogic.com/collation/en/S1')
      ])
    );
    if (!fn.empty(ref)) {
      ref = fn.head(ref);
      refId = fn.baseUri(ref);
      match_rule = 'UNQ_Publisher_Product_Version: Match on publisher, product and version';
      m_norm_publisher = ref.root.envelope.instance.NORM_PUBLISHER;
      m_norm_product = ref.root.envelope.instance.NORM_PRODUCT;
      m_norm_edition = ref.root.envelope.instance.NORM_EDITION;
      m_license = ref.root.envelope.instance.L == 'Y';
    }
  }

  // UNQ_Publisher_Product_MAJOR_MINOR_Version: Next if there is a match on publisher, product and on major and minor version
  if (fn.empty(ref)) {
    ref = cts.search(
      cts.andQuery([
        cts.collectionQuery('I_Inventory_Reference'),
        cts.jsonPropertyRangeQuery('SCCM_PUBLISHER', '=', m_publisher, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyRangeQuery('SCCM_PRODUCT', '=', m_product, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyValueQuery('SCCM_VERSION', m_major + '.' + m_minor + '*', 'wildcarded')
      ])
    );
    if (!fn.empty(ref)) {
      ref = fn.head(ref);
      refId = fn.baseUri(ref);
      match_rule = 'UNQ_Publisher_Product_MAJOR_MINOR_Version: Match on publisher, product and on major and minor version';
      m_norm_publisher = ref.root.envelope.instance.NORM_PUBLISHER;
      m_norm_product = ref.root.envelope.instance.NORM_PRODUCT;
      m_norm_edition = ref.root.envelope.instance.NORM_EDITION;
      m_license = ref.root.envelope.instance.L == 'Y';
    }
  }

  // UNQ_Publisher_Product_MAJOR_Version: Next if there is a match on publisher, product and on major version
  if (fn.empty(ref)) {
    ref = cts.search(
      cts.andQuery([
        cts.collectionQuery('I_Inventory_Reference'),
        cts.jsonPropertyRangeQuery('SCCM_PUBLISHER', '=', m_publisher, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyRangeQuery('SCCM_PRODUCT', '=', m_product, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyValueQuery('SCCM_VERSION', m_major + '*', 'wildcarded')
      ])
    );
    if (!fn.empty(ref)) {
      ref = fn.head(ref);
      refId = fn.baseUri(ref);
      match_rule = 'UNQ_Publisher_Product_MAJOR_Version: Match on publisher, product and on major version';
      m_norm_publisher = ref.root.envelope.instance.NORM_PUBLISHER;
      m_norm_product = ref.root.envelope.instance.NORM_PRODUCT;
      m_norm_edition = ref.root.envelope.instance.NORM_EDITION;
      m_license = ref.root.envelope.instance.L == 'Y';
    }
  }

  // UNQ_Publisher_Product: This can not be used to determine version and license
  if (fn.empty(ref)) {
    ref = cts.search(
      cts.andQuery([
        cts.collectionQuery('I_Inventory_Reference'),
        cts.jsonPropertyRangeQuery('SCCM_PUBLISHER', '=', m_publisher, 'collation=http://marklogic.com/collation/en/S1'),
        cts.jsonPropertyRangeQuery('SCCM_PRODUCT', '=', m_product, 'collation=http://marklogic.com/collation/en/S1')
      ])
    );
    if (!fn.empty(ref)) {
      ref = fn.head(ref);
      refId = fn.baseUri(ref);
      match_rule = 'UNQ_Publisher_Product: This can not be used to determine version and license';
      m_norm_publisher = ref.root.envelope.instance.NORM_PUBLISHER;
      m_norm_product = ref.root.envelope.instance.NORM_PRODUCT;
      //m_license = ref.root.envelope.instance.L == 'Y' ? true : false;
    }
  }

  // UNQ_Publ: Only to determine the publisher if all above fails
  if (fn.empty(ref)) {
    ref = cts.search(
      cts.andQuery([
        cts.collectionQuery('I_Inventory_Reference'),
        cts.jsonPropertyRangeQuery('SCCM_PUBLISHER', '=', m_publisher, 'collation=http://marklogic.com/collation/en/S1')
      ])
    );
    if (!fn.empty(ref)) {
      ref = fn.head(ref);
      refId = fn.baseUri(ref);
      match_rule = 'UNQ_Publ: Only to determine the publisher if all above fails';
      m_norm_publisher = ref.root.envelope.instance.NORM_PUBLISHER;
      //m_norm_product = ref.root.envelope.instance.NORM_PRODUCT;
      //m_license = ref.root.envelope.instance.L == 'Y' ? true : false;
    }
  }

  // Generate a full product string
  let m_full_product = m_norm_publisher + ' ' + m_norm_product + ' ' + m_norm_edition + ' ' + m_major;

  // Generate a unique docId
  let docId = '/Inventory/' + sem.uuidString() + '.json';

  // Create the fields information for domain experts
  var m_fields = new Array();
  if (m_relevant == true) {
    m_fields.push ('RELEVANT');
  }
  if (m_license == true) {
    m_fields.push ('LICENSABLE');
  }

  // Create the instance data
  instance = {
    "info": {
      "title" : "Inventory",
      "version" : "0.0.1",
      "baseUri" : "http://example.org/",
      "description" : "Normalised view of inventory information"
    },
    "Inventory": {
      "docid": docId,
      "id": m_id,
      "username": m_username,
      "publisher": m_publisher,
      "product": m_product,
      "version": m_version,
      "scan_date": m_scan_date,
      "install_date": m_install_date,
      "relevant": m_relevant,
      "ref_publisher": m_ref_publisher,
      "ref_product": m_ref_product,
      "major": m_major,
      "minor": m_minor,
      "norm_publisher": m_norm_publisher,
      "norm_product": m_norm_product,
      "norm_edition": m_norm_edition,
      "full_product": m_full_product,
      "license": m_license,
      "fields": m_fields
    }
  };

  ///////////////////////////////////////////////
  // BEGIN CUSTOM HEADER CODE FOR MAP_METERING //
  ///////////////////////////////////////////////

  headers = {
    "sources": {
      "name": "Inventory",
      "raw": id,
      "reference": refId,
      "match_rule": match_rule
    },
    "createdOn": fn.currentDateTime(),
    "createdBy": xdmp.getCurrentUser(),
    "createdUsingMapping": "Map_Inventory"
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
