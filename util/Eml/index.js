import licenseEnum from "../../enum/license.js"
import {encode} from 'html-entities';

const TAX_COVERAGE_LIMIT = 200;

const TAX_COVERAGE_RANKS = ['kingdom', 'phylum', 'class', 'order', 'family']

const escapeHtml = (unsafe) => {
    return encode(unsafe, {mode: 'nonAsciiPrintable', level: 'xml'})
}

const getBibliography = (bibliographicReferences) => {
    if(!bibliographicReferences){
        return ""
    } else {
      const refs = bibliographicReferences.map(ref => `<citation identifier="DOI:${escapeHtml(ref?.key)}">${escapeHtml(ref?.value)}</citation>`)
      return `<bibliography>${refs.join("")}</bibliography>`
    }
}

const getMethodSteps = (methodSteps) => {
    if(!methodSteps || methodSteps?.length === 0){
        return null
    } else {
      return methodSteps.map(s => `<methodStep>
      <description>
      <para>${escapeHtml(s)}</para>
      </description>
  </methodStep>`).join("")
    }
}

const getStudyExtent = (extent) => {

    return extent ? `<studyExtent>
    <description>
        <para>${escapeHtml(extent)}</para>
    </description>
</studyExtent>` : null
}

const getSamplingDescription = (description) => {
    return description ? `<samplingDescription>
    <para>${escapeHtml(description)}</para>
</samplingDescription>` : null;
}

const getKeywords = (keywords, keywordThesaurus) => {
    if(!keywords || keywords?.length === 0){
        return ""
    } else {
      let kWords = keywords.map(s => `<keyword>${escapeHtml(s)}</keyword>`).join("")
      return `<keywordSet>${kWords}<keywordThesaurus>${escapeHtml(keywordThesaurus || "N/A")}</keywordThesaurus>
      </keywordSet>`
    }
}

const getComplexType = (entity, attrs, atrrName) => {
    return attrs.find(key => entity.hasOwnProperty(key)) ? `<${atrrName}>` + 
        attrs.map(a => entity?.[a] ? `<${a}>${escapeHtml(entity[a])}</${a}>` : "").join("")
        +  `</${atrrName}>`: "";
}

const getAgent = (agent, type) => {
    if(!agent){
        return ""
    } else {

        const individualName = getComplexType(agent, ['givenName', 'surName'], 'individualName')
        const address = getComplexType(agent, ['deliveryPoint', 'city', 'postalCode', 'administrativeArea', 'country'], 'address');
      return  `<${type}>
    ${individualName}
    ${agent?.organizationName ? `<organizationName>${escapeHtml(agent?.organizationName)}</organizationName>` : ""}
    ${agent?.positionName ? `<positionName>${escapeHtml(agent?.positionName)}</positionName>` : ""}
    ${address}
    ${agent?.phone ? `<phone>${escapeHtml(agent?.phone)}</phone>` : ""}
    ${agent?.electronicMailAddress ? `<electronicMailAddress>${escapeHtml(agent?.electronicMailAddress)}</electronicMailAddress>` : ""}
    ${agent?.userId ? `<userId directory="http://orcid.org/">${escapeHtml(agent?.userId)}</userId>` : ""}
    ${agent?.role ? `<role>${escapeHtml(agent?.role)}</role>` : ""}
    </${type}>`
    } 
}

const getGeographicCoverage = (geographicCoverage) => {

    // TODO add <geographicDescription>The samples were collected at 19 stations distributed along the Baltic Sea, Kattegat and Skagerrak</geographicDescription>

    return geographicCoverage ? `
    <geographicCoverage>          
           <boundingCoordinates>
               <westBoundingCoordinate>${geographicCoverage?.westBoundingCoordinate}</westBoundingCoordinate>
               <eastBoundingCoordinate>${geographicCoverage?.eastBoundingCoordinate}</eastBoundingCoordinate>
               <northBoundingCoordinate>${geographicCoverage?.northBoundingCoordinate}</northBoundingCoordinate>
               <southBoundingCoordinate>${geographicCoverage?.southBoundingCoordinate}</southBoundingCoordinate>
           </boundingCoordinates>
       </geographicCoverage>` : ""
}

const getTemporalCoverage = temporalCoverage => {

    return temporalCoverage ? `
    <temporalCoverage>
        <rangeOfDates>
            <beginDate>
                <calendarDate>${temporalCoverage.from}</calendarDate>
            </beginDate>
            <endDate>
            <calendarDate>${temporalCoverage.to}</calendarDate>
            </endDate>
        </rangeOfDates>
    </temporalCoverage>` : ""
}

const getTaxonomicCoverage = taxonomicCoverage => {


    const taxonomicClassifications = TAX_COVERAGE_RANKS.filter(rank => Object.keys(taxonomicCoverage || {}).includes(rank)).reduce((acc, curr) => {
        acc[curr] = taxonomicCoverage[curr].map(e => `<taxonomicClassification>
        <taxonRankName>${curr}</taxonRankName>
    <taxonRankValue>${escapeHtml(e)}</taxonRankValue>
</taxonomicClassification>`)
        return acc
    },{})

    const hasData = TAX_COVERAGE_RANKS.filter(rank => Object.keys(taxonomicCoverage || {}).includes(rank)).reduce((acc, curr) => (acc || taxonomicCoverage[curr].length > 0 ), false)
    // todo  <generalTaxonomicCoverage>Eukaryotic plankton</generalTaxonomicCoverage>

    return hasData ?`<taxonomicCoverage>
   ${TAX_COVERAGE_RANKS.filter(rank => Object.keys(taxonomicCoverage || {}).includes(rank)).reduce((acc, curr) => (acc.length + taxonomicClassifications[curr].length  < TAX_COVERAGE_LIMIT ? [...acc, ...taxonomicClassifications[curr]]: acc), []).join('\n')}
  
</taxonomicCoverage>`: ""
}

const getCoverage = ({geographicCoverage, temporalCoverage, taxonomicCoverage}) => {
    const geographic = getGeographicCoverage(geographicCoverage)
    const taxonomic = getTaxonomicCoverage(taxonomicCoverage)
    const temporal = getTemporalCoverage(temporalCoverage)
    if(geographic || taxonomic || temporal){
       return  `
       <coverage>
        ${geographic}
        ${temporal}
        ${taxonomic}
        </coverage>
       `
    } else {
        return ""
    }
}

const getUrl = url => !!url ? `<distribution scope="document">
<online>
    <url function="information">${escapeHtml(url)}</url>
</online>
</distribution>` : ""

export const getEml = ({id, license, title, description, contact, creator, metadataProvider, associatedParty, methodSteps, doi, url, bibliographicReferences, keywords, keywordThesaurus, studyExtent, samplingDescription, geographicCoverage, temporalCoverage, taxonomicCoverage }) => {
    if(!licenseEnum[license]){
        throw "invalid or missing license"
    }
    
    const steps = getMethodSteps(methodSteps);
    const sampling = [getStudyExtent(studyExtent), getSamplingDescription(samplingDescription)].filter(e => !!e).join("\n");

    return `
    <eml:eml
        xmlns:eml="eml://ecoinformatics.org/eml-2.1.1"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="eml://ecoinformatics.org/eml-2.1.1 http://rs.gbif.org/schema/eml-gbif-profile/1.1/eml.xsd"
            packageId="${id}"  system="http://gbif.org" scope="system"
      xml:lang="en">
        <dataset>
            ${doi ? `<alternateIdentifier>https://doi.org/${escapeHtml(doi)}</alternateIdentifier>` : ""}
            <title>${escapeHtml(title)}</title>
            ${creator && creator?.length > 0 ? creator.map(c => getAgent(c, 'creator')).join("") : ""}
            ${metadataProvider && metadataProvider?.length > 0 ? metadataProvider.map(c => getAgent(c, 'metadataProvider')).join("") : ""}
            ${associatedParty && associatedParty?.length > 0 ? associatedParty.map(c => getAgent(c, 'associatedParty')).join("") : ""}
            <pubDate>
          ${new Date().toISOString().split("T")[0]}
          </pubDate>
            <language>ENGLISH</language>
            <abstract>
            ${description ? `<para>${escapeHtml(description)}</para>` : "" }
                <para>[This dataset was processed using the GBIF eDNA converter tool.]</para>
            </abstract>
            ${getKeywords(keywords, keywordThesaurus)}
            <intellectualRights>
                <para>This work is licensed under a 
                    <ulink url="${licenseEnum[license].url}">
                        <citetitle>${licenseEnum[license].url}</citetitle>
                    </ulink>.
                </para>
            </intellectualRights>
            ${getUrl(url)}
            <maintenance>
                    <description>
                        <para></para>
                    </description>
                <maintenanceUpdateFrequency>unkown</maintenanceUpdateFrequency>
            </maintenance>
            ${getAgent(contact, 'contact')}
           ${(steps || sampling) ? `<methods>
            ${steps ? steps : ""}
            ${sampling ? "<sampling>" + sampling + "</sampling>": ""}
        </methods>` : ""}
        ${getCoverage({geographicCoverage, temporalCoverage, taxonomicCoverage})}
        </dataset>
        <additionalMetadata>
            <metadata>
                <gbif>
                    ${getBibliography(bibliographicReferences)}
                </gbif>
            </metadata>
        </additionalMetadata>
    </eml:eml>`
} 