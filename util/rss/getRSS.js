import db from "../../server/db/index.js"
import config from "../../config.js"
import {getApplicationIP} from "../index.js"
const EDNA_NAMESPACE = "edna";
// http://localhost:9000/dataset/436ddffe-d29a-43ff-a065-0f1bf7748284/file/data.biom.h5
const getItem = (e, frontendUrl) => {

    return `<item>
    <title>${e?.title}</title>
    <link>${frontendUrl}/dataset/${e?.dataset_id}</link>
    <!--  shows what changed in this version, or shows the resource description if change summary was empty  -->
    <description>${e?.dataset_description}</description>
    <author>${e?.dataset_author || e?.user_name}</author>
    <${EDNA_NAMESPACE}:eml>${config.dwcPublicAccessUrl}${e?.dataset_id}/${e?.version}/archive/eml.xml</${EDNA_NAMESPACE}:eml>
    <${EDNA_NAMESPACE}:dwca>${config.dwcPublicAccessUrl}${e?.dataset_id}/${e?.version}/archive.zip</${EDNA_NAMESPACE}:dwca>
    <${EDNA_NAMESPACE}:biom>${config.dwcPublicAccessUrl}${e?.dataset_id}/${e?.version}/data.biom.h5</${EDNA_NAMESPACE}:biom>
    <pubDate>${e.dwc_generated}</pubDate>
    <guid isPermaLink="false">${frontendUrl}/dataset/${e?.dataset_id}</guid>
    </item>
    `
}



const getRssXml = ({link, atomLink, title, description, installationKey, items}) => {

    return `<rss xmlns:${EDNA_NAMESPACE}="${link}" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
    <channel>
    <title>${title}</title>
    <link>${link}</link>
    <atom:link href="${atomLink}" rel="self" type="application/rss+xml"/>
    <description>${description}</description>
    <language>en-us</language>
    <!--  RFC-822 date-time / Wed, 02 Oct 2010 13:00:00 GMT  -->
    <pubDate>${''/** pubdate ?? */}Tue, 15 Feb 2011 15:43:23 +0000</pubDate>
    <lastBuildDate>Tue, 06 Aug 2024 15:02:48 +0000</lastBuildDate>
    <!--  UUID of the IPT making RSS feed available  -->
    <${EDNA_NAMESPACE}:identifier>${installationKey}</${EDNA_NAMESPACE}:identifier>
    <generator>GBIF eDNA Tool</generator>
    <webMaster>${config?.installationContactEmail}</webMaster>
    <docs>http://cyber.law.harvard.edu/rss/rss.html</docs>
    <ttl>15</ttl>
   
        ${items}
    </channel>
</rss>
    `
}

const getRSS = async () => {


    const prodPublishingEnabled = config?.prodPublishingEnabled
    const ipaddress = `${getApplicationIP()}:${config.expressPort}`;
    const atomLink =   `${(config?.backendProxyUrl || ipaddress)}/rss`
    const datasets = await db.getDatasetsOrderedByDwcCreated(20);
    const frontendUrl = config?.frontendUrl || "";
    const items = datasets/* .filter(d => prodPublishingEnabled ? !!d?.gbif_prod_key : true) */.map(e => getItem(e, frontendUrl )).join('')

    return getRssXml({link: frontendUrl, atomLink, title: config?.title, description: config?.description, items, installationKey: config?.prodInstallationKey || config?.uatInstallationKey})
}

export default getRSS;