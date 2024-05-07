import { Biom } from 'biojs-io-biom';
import fs from 'fs'
import _ from 'lodash'
import { mean, std } from 'mathjs'
let h5wasm;
const generatedByString = "GBIF eDNA Tool";
const MAX_FIXED_STRING_LENGTH = 1024

const init = async () => {
    h5wasm = await import("h5wasm/node");
    await h5wasm?.ready
    return h5wasm
}

init();

const taxonomy = [
    [
      'Fungi',
      'Ascomycota',
      'Archaeorhizomycetes',
      'Archaeorhizomycetales',
      'Archaeorhizomycetaceae',
      'Archaeorhizomyces',
      '6b23e6bc0fbe2cde18b5d2d17335f54157a629fb'
    ],
    [
      'Fungi',
      'Ascomycota',
      'Archaeorhizomycetes',
      'Archaeorhizomycetales',
      'Archaeorhizomycetaceae',
      'Archaeorhizomyces',
      '282a4068f53f33244f372079ce7634af48ff32dc'
    ],
    [
      'Fungi',
      'Basidiomycota',
      'Tremellomycetes',
      'Tremellales',
      'Tremellales_fam_Incertae_sedis',
      'Cryptococcus',
      'fcf6642261e836a14d1e996e9d19f5b5d5d633f9'
    ],
    [
      'Fungi',
      'Ascomycota',
      'Lecanoromycetes',
      'Lecanorales',
      'Parmeliaceae',
      'Parmelia',
      '90774b6411d6f8af6bb92a122bc5a5c42f661f8c'
    ],
    [
      'Fungi',
      'Zygomycota',
      'Mortierellomycotina_cls_Incertae_sedis',
      'Mortierellales',
      'Mortierellaceae',
      'Mortierella',
      'efa49da6c35317a5fb9d9551e631656448ac4a0e'
    ],
    [
      'Fungi',
      'Ascomycota',
      'Archaeorhizomycetes',
      'Archaeorhizomycetales',
      'unidentified',
      'unidentified',
      '1b247938f45848d8761666c36ca6d73b3fccd049'
    ],
    [
      'Fungi',
      'Ascomycota',
      'Archaeorhizomycetes',
      'Archaeorhizomycetales',
      'Archaeorhizomycetaceae',
      'Archaeorhizomyces',
      '771887cd811081f10521daf25c8f7a96906af63e'
    ],
    [
      'Fungi',
      'Basidiomycota',
      'Agaricomycetes',
      'Phallales',
      'Phallaceae',
      'Phallus',
      'dd01c0d5c7446aa55244831d3dbf958fefc7ea29'
    ],
    [
      'Fungi',
      'Ascomycota',
      'Archaeorhizomycetes',
      'Archaeorhizomycetales',
      'Archaeorhizomycetaceae',
      'Archaeorhizomyces',
      '2327353461c7b35779bf54363646aa847a01e7d3'
    ],
    [
      'Fungi',
      'Zygomycota',
      'Mortierellomycotina_cls_Incertae_sedis',
      'Mortierellales',
      'Mortierellaceae',
      'Mortierella',
      'be5255f9fb42b64df755d7ac2a169e1da5073d48'
    ]
  ]

const test = async () => {
    
    try {
        if(!h5wasm){
            await init()
        }
        await h5wasm?.ready;
       
        try {
            const f = new h5wasm.File('/Users/vgs417/edna-tool-backend/tests/output/test.h5', "w");
            f.create_group('observation');
            f.create_group('observation/metadata');
            console.log(`taxonomy.length ${taxonomy.length} taxonomy[0].length ${taxonomy[0].length}`  )
            console.log(taxonomy[0])
            f.get('observation/metadata').create_dataset({name: "taxonomy", data: taxonomy.flat(), dtype: 'S', shape: [taxonomy.length, 7]})
            f.close()
        } catch (error) {
            console.log("Error adding taxonomy to hdf5")
            console.log(error)
        }

    } catch(err){
        console.log(err)
    }
}

test()