import {encode} from 'html-entities';

export default (occCore, dnaExt, hasEmof, ignoreHeaderLines = 0) => {
const coreTerms = occCore.filter(term => !term.default).map((term, idx) => `<field index="${idx+1}" term="${term.qualName}"/>`).join(`
`);
const coreDefaultValueTerms = occCore.filter(term => !!term.default).map((term, idx) => `<field default="${encode(term.default, {mode: 'nonAsciiPrintable', level: 'xml'})}" term="${term.qualName}"/>`).join(`
`);
const dnaTerms = dnaExt.filter(term => !term.default).map((term, idx) => `<field index="${idx+1}" term="${term.qualName}"/>`).join(`
`);
const dnaDefaultValueTerms = dnaExt.filter(term => !!term.default).map((term, idx) => `<field default="${encode(term.default, {mode: 'nonAsciiPrintable', level: 'xml'})}" term="${term.qualName}"/>`).join(`
`);

const emof = hasEmof ? `<extension encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy='' ignoreHeaderLines="${ignoreHeaderLines}" rowType="http://rs.iobis.org/obis/terms/ExtendedMeasurementOrFact">
<files>
  <location>emof.txt</location>
</files>
<coreid index="0" />
    <field index="1" term="http://rs.tdwg.org/dwc/terms/measurementType"/>
    <field index="2" term="http://rs.tdwg.org/dwc/terms/measurementValue"/>
    <field index="3" term="http://rs.tdwg.org/dwc/terms/measurementUnit"/>
    <field index="4" term="http://rs.tdwg.org/dwc/terms/measurementAccuracy"/>
    <field index="5" term="http://rs.tdwg.org/dwc/terms/measurementMethod"/>
</extension>` : "";

return `<archive
xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml">
<core encoding="utf-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy="" ignoreHeaderLines="${ignoreHeaderLines}" rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
    <files>
        <location>occurrence.txt</location>
    </files>
    <id index="0" />
    <field index="0" term="http://rs.tdwg.org/dwc/terms/occurrenceID"/>
    ${coreTerms}
    ${coreDefaultValueTerms}
</core>

<extension encoding="UTF-8" fieldsTerminatedBy="\\t" linesTerminatedBy="\\n" fieldsEnclosedBy='' ignoreHeaderLines="${ignoreHeaderLines}" rowType="http://rs.gbif.org/terms/1.0/DNADerivedData">
<files>
  <location>dna.txt</location>
</files>
<coreid index="0" />
    ${dnaTerms}
    ${dnaDefaultValueTerms}
</extension>
${emof}
</archive>
`
}

