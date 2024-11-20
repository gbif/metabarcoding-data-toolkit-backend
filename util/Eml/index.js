import licenseEnum from "../../enum/license.js"
import {encode} from 'html-entities';

const TAX_COVERAGE_LIMIT = 200;

const TAX_COVERAGE_RANKS = ['kingdom', 'phylum', 'class', 'order', 'family']

const DEFAULT_KEYWORDS = ['metabarcoding', 'DNA', 'MDT']

const formatXml = (xml, tab) => { // tab = optional indent value, default is tab (\t)
    let formatted = '', indent= '';
    tab = tab || '\t';
    xml.split(/>\s*</).forEach(function(node) {
        if (node.match( /^\/\w/ )) indent = indent.substring(tab.length); // decrease indent by one 'tab'
        formatted += indent + '<' + node + '>\r\n';
        if (node.match( /^<?\w[^>]*[^\/]$/ )) indent += tab;              // increase indent
    });
    return formatted.substring(1, formatted.length-3);
}

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

const getKeywords = (keywords = [], keywordThesaurus) => {
   
      let kWords = [...DEFAULT_KEYWORDS,...keywords].map(s => `<keyword>${escapeHtml(s)}</keyword>`).join("")
      return `<keywordSet>${kWords}<keywordThesaurus>${escapeHtml(keywordThesaurus || "N/A")}</keywordThesaurus>
      </keywordSet>`
    
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
    const boundingCoordinates = !!geographicCoverage?.westBoundingCoordinate 
        && !!geographicCoverage?.eastBoundingCoordinate 
        && !!geographicCoverage?.northBoundingCoordinate 
        && !!geographicCoverage?.southBoundingCoordinate ? `<boundingCoordinates>
               <westBoundingCoordinate>${geographicCoverage?.westBoundingCoordinate}</westBoundingCoordinate>
               <eastBoundingCoordinate>${geographicCoverage?.eastBoundingCoordinate}</eastBoundingCoordinate>
               <northBoundingCoordinate>${geographicCoverage?.northBoundingCoordinate}</northBoundingCoordinate>
               <southBoundingCoordinate>${geographicCoverage?.southBoundingCoordinate}</southBoundingCoordinate>
           </boundingCoordinates>` : "";
    const geographicDescription = !!geographicCoverage?.geographicDescription ? `<geographicDescription>${escapeHtml(geographicCoverage?.geographicDescription)}</geographicDescription>` : "";
    return !!boundingCoordinates || !!geographicDescription ? 
    `<geographicCoverage>   
            ${geographicDescription}       
           ${boundingCoordinates}
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

    const hasData = TAX_COVERAGE_RANKS.filter(rank => Object.keys(taxonomicCoverage || {}).includes(rank)).reduce((acc, curr) => (acc || taxonomicCoverage[curr].length > 0 ), false) || !!taxonomicCoverage?.generalTaxonomicCoverage
    // todo  <generalTaxonomicCoverage>Eukaryotic plankton</generalTaxonomicCoverage>

    return hasData ?`<taxonomicCoverage>
    ${!!taxonomicCoverage?.generalTaxonomicCoverage ? "<generalTaxonomicCoverage>"+ escapeHtml(taxonomicCoverage?.generalTaxonomicCoverage) +"</generalTaxonomicCoverage>":""}
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

export const getProject = (project) => {

    if(!project){
        return ""
    } else {
        const {identifier, title, personnel, description, funding, studyAreaDescription, designDescription} = project;
        const identifier_ = !!identifier ? `id="${escapeHtml(identifier)}"` : ""
        const title_ = !!title ? `<title>${escapeHtml(title)}</title>` : "";
        const personnel_ = !!personnel && personnel?.length > 0 ? personnel.map(c => getAgent(c, 'personnel')).join("") : "";
        const description_ = !!description ? `<abstract>
        <para>${escapeHtml(description)}</para>
    </abstract>` : ""
        const funding_ = !!funding ? `<funding>
        <para>${escapeHtml(funding)}</para>
    </funding>` : "";
        const studyAreaDescription_ = !!studyAreaDescription ? `<studyAreaDescription>
        <descriptor name="generic"
                    citableClassificationSystem="false">
            <descriptorValue>${escapeHtml(studyAreaDescription)}</descriptorValue>
        </descriptor>
    </studyAreaDescription>` : ""

        const designDescription_ = !!designDescription ? `<designDescription>
        <description>
            <para>${escapeHtml(designDescription)}</para>
        </description>
    </designDescription>` : ""
        return `<project ${identifier_}>
        ${title_}
            ${personnel_}
            ${description_}
            ${funding_}
            ${studyAreaDescription_}
            ${designDescription_}
    </project>`
    }

  
}

export const getEml = ({id, license, title, description, contact, creator, metadataProvider, associatedParty, methodSteps, doi, url, bibliographicReferences, keywords, keywordThesaurus, studyExtent, samplingDescription, geographicCoverage, temporalCoverage, taxonomicCoverage, project }) => {
    if(!licenseEnum[license]){
        throw "invalid or missing license"
    }
    
    const steps = getMethodSteps(methodSteps);
    const sampling = [getStudyExtent(studyExtent), getSamplingDescription(samplingDescription)].filter(e => !!e).join("\n");

    return formatXml(`<eml:eml xmlns:eml="https://eml.ecoinformatics.org/eml-2.2.0"
         xmlns:dc="http://purl.org/dc/terms/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="https://eml.ecoinformatics.org/eml-2.2.0 https://rs.gbif.org/schema/eml-gbif-profile/1.3/eml.xsd"
         packageId="${id}" system="http://gbif.org" scope="system"
         xml:lang="eng">
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
                <para>[This dataset was processed using the GBIF Metabarcoding Data Toolkit.]</para>
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
            ${getCoverage({geographicCoverage, temporalCoverage, taxonomicCoverage})}

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
            ${getProject(project)}
            
          
        </dataset>
        <additionalMetadata>
            <metadata>
                <gbif>
                    <dateStamp>${new Date().toISOString()}</dateStamp>
                    ${getBibliography(bibliographicReferences)}
                </gbif>
            </metadata>
        </additionalMetadata>
    </eml:eml>`)
} 