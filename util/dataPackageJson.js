

const eventAssertionBlock = {
       "name": "event-assertion",
      "path": "data/event-assertion.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/refs/heads/master/dwc-dp/0.1/table-schemas/event-assertion.json"
    }
const defaultResources = [
    {
      "name": "event",
      "path": "data/event.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/refs/heads/master/dwc-dp/0.1/table-schemas/event.json"
    },
    {
      "name": "nucleotide-analysis",
      "path": "data/nucleotide-analysis.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/refs/heads/master/dwc-dp/0.1/table-schemas/nucleotide-analysis.json"
    },
    {
      "name": "molecular-protocol",
      "path": "data/molecular-protocol.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/refs/heads/master/dwc-dp/0.1/table-schemas/molecular-protocol.json"
    },
    {
      "name": "nucleotide-sequence",
      "path": "data/nucleotide-sequence.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/refs/heads/master/dwc-dp/0.1/table-schemas/nucleotide-sequence.json"
    },
    {
      "name": "identification",
      "path": "data/identification.csv",
      "schema": "https://raw.githubusercontent.com/gbif/dwc-dp/refs/heads/master/dwc-dp/0.1/table-schemas/identification.json"
    }
  ]
export default ({hasEventAssertion = false, resources}) => (JSON.stringify({
  "name": "dwc-data-package",
  "title": "Darwin Core Data Package",
  "description": "A data package containing Darwin Core related tables for molecular data.",
  "resources": !!resources ? resources : hasEventAssertion ? [...defaultResources, eventAssertionBlock] : defaultResources
}, null, 2))

