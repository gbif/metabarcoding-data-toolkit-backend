

const eventAssertionBlock = {
       "name": "event-assertion",
      "path": "data/event-assertion.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/0fc041559db078c0c1cbdba8f8ffb4073319e2fa/dwc-dp/table-schemas/event-assertion.json"
    }
const defaultResources = [
    {
      "name": "event",
      "path": "data/event.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/0fc041559db078c0c1cbdba8f8ffb4073319e2fa/dwc-dp/table-schemas/event.json"
    },
    {
      "name": "nucleotide-analysis",
      "path": "data/nucleotide-analysis.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/0fc041559db078c0c1cbdba8f8ffb4073319e2fa/dwc-dp/table-schemas/nucleotide-analysis.json"
    },
    {
      "name": "molecular-protocol",
      "path": "data/molecular-protocol.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/0fc041559db078c0c1cbdba8f8ffb4073319e2fa/dwc-dp/table-schemas/molecular-protocol.json"
    },
    {
      "name": "nucleotide-sequence",
      "path": "data/nucleotide-sequence.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/0fc041559db078c0c1cbdba8f8ffb4073319e2fa/dwc-dp/table-schemas/nucleotide-sequence.json"
    },
    {
      "name": "identification",
      "path": "data/identification.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/0fc041559db078c0c1cbdba8f8ffb4073319e2fa/dwc-dp/table-schemas/identification.json"
    }
  ]
// Stamped into every package so its schema generation is stated rather than guessed. Packages
// generated before this carry no marker at all - see the structural fallback in
// util/dwcdpVersion.js, which reads the column names instead.
export const MDT_SCHEMA_VERSION = "1.0-DEV";
export const SCHEMA_SOURCE_COMMIT = "0fc041559db078c0c1cbdba8f8ffb4073319e2fa";

export default ({hasEventAssertion = false, resources}) => (JSON.stringify({
  "name": "dwc-data-package",
  "title": "Darwin Core Data Package",
  "description": "A data package containing Darwin Core related tables for molecular data.",
  "mdtSchemaVersion": MDT_SCHEMA_VERSION,
  "mdtSchemaSourceCommit": SCHEMA_SOURCE_COMMIT,
  "resources": !!resources ? resources : hasEventAssertion ? [...defaultResources, eventAssertionBlock] : defaultResources,
  "dialect": {
        "delimiter": "\t",
        "quoteChar": "\"",
        "lineTerminator": "\n",
        "header": true,
        "doubleQuote": true,
        "skipInitialSpace": false,
        "commentChar": "#",
        "caseSensitiveHeader": false
      }
}, null, 2))

