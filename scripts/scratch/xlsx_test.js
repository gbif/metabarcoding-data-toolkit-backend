
import {processWorkBookFromFile} from '../../converters/excel.js'




const testExcel = async () => {
  const biom = await processWorkBookFromFile('testxlsx', `Danish_Reefs_eDNA_2file.xlsx`, 1, {samples: {id: 'sampleID'}, taxa: { id: "ID"}, defaultValues: {}})

   console.log(JSON.stringify(biom))

}

//biowideToBiomToDwc('_min')
testExcel()

