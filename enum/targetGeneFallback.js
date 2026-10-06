// Bundled copy of the GBIF target_gene vocabulary, used only when api.gbif.org cannot
// be reached - see util/targetGeneVocabulary.js. Already normalised, alternative labels
// included: those are where the forms people actually write live (12S, 18S, ITS, COX1),
// so a fallback without them would fail to match almost every real value.
// It is a fallback, not a source of truth. Captured 2026-10-01.

export default [
  {
    "name": "SSU_rRNA_16S_prokaryotic",
    "label": "16S ribosomal small subunit RNA (prokaryotic) (pro16S)",
    "definition": null,
    "parent": "SSU_rRNA",
    "alternativeLabels": [
      "16S rRNA (SSU prokaryote)",
      "16Spro",
      "16SproRNA",
      "16S prokariotic"
    ]
  },
  {
    "name": "SSU_rRNA_18S_eukaryotic",
    "label": "18S ribosomal small subunit RNA (eukaryotic) (18S)",
    "definition": null,
    "parent": "SSU_rRNA",
    "alternativeLabels": [
      "18Seuk",
      "18SeukRNA",
      "RNA18S",
      "18S",
      "18SrRNA"
    ]
  },
  {
    "name": "SSU_rRNA_12S_mitochondrial",
    "label": "12S ribosomal small subunit RNA (mitochondrial) (12S)",
    "definition": null,
    "parent": "SSU_rRNA",
    "alternativeLabels": [
      "12Smt",
      "12SmtRNA",
      "RNA12S",
      "12S",
      "12SrRNA",
      "mt12S",
      "MT-RNR1"
    ]
  },
  {
    "name": "SSU_rRNA_16S_plastid",
    "label": "16S ribosomal small subunit RNA (plastid) (cp16S)",
    "definition": null,
    "parent": "SSU_rRNA",
    "alternativeLabels": [
      "16Spla",
      "16SplaRNA",
      "cp16S",
      "16S chloroplast",
      "16S plastid"
    ]
  },
  {
    "name": "SSU_rRNA",
    "label": "Small subunit ribosomal RNA (SSU)",
    "definition": null,
    "parent": "Ribosomal_RNA",
    "alternativeLabels": [
      "SSU"
    ]
  },
  {
    "name": "LSU_rRNA_23S_prokaryotic",
    "label": "23S ribosomal large subunit RNA (prokaryotic) (23S)",
    "definition": null,
    "parent": "LSU_rRNA",
    "alternativeLabels": [
      "23Spro",
      "23SproRNA",
      "23S prokariotic"
    ]
  },
  {
    "name": "LSU_rRNA_28S_eukaryotic",
    "label": "28S ribosomal large subunit RNA (eukaryotic) (28S)",
    "definition": null,
    "parent": "LSU_rRNA",
    "alternativeLabels": [
      "28Seuk",
      "28SeukRNA",
      "RNA28S",
      "28S",
      "28SrRNA"
    ]
  },
  {
    "name": "LSU_rRNA_16S_mitochondrial",
    "label": "16S ribosomal large subunit RNA (mitochondrial) (mt16S)",
    "definition": null,
    "parent": "LSU_rRNA",
    "alternativeLabels": [
      "16Smt",
      "16SmtRNA",
      "mt16S",
      "MT-RNR2"
    ]
  },
  {
    "name": "LSU_rRNA_23S_plastid",
    "label": "23S ribosomal large subunit RNA (plastid) (cp23S)",
    "definition": null,
    "parent": "LSU_rRNA",
    "alternativeLabels": [
      "23Spla",
      "23SplaRNA",
      "cp23S",
      "23S chloroplast",
      "23S plastid",
      "UPS"
    ]
  },
  {
    "name": "LSU_rRNA",
    "label": "Large subunit ribosomal RNA (LSU)",
    "definition": null,
    "parent": "Ribosomal_RNA",
    "alternativeLabels": [
      "LSU"
    ]
  },
  {
    "name": "ITS1",
    "label": "Internal Transcribed Spacer 1 (ITS1)",
    "definition": null,
    "parent": "ITS_region",
    "alternativeLabels": []
  },
  {
    "name": "ITS2",
    "label": "Internal Transcribed Spacer 2 (ITS2)",
    "definition": null,
    "parent": "ITS_region",
    "alternativeLabels": []
  },
  {
    "name": "ITS_region",
    "label": "Internal Transcribed Spacer region (ITS)",
    "definition": null,
    "parent": "Ribosomal_RNA",
    "alternativeLabels": [
      "ITS",
      "ITS1+5.8S+ITS2",
      "nrITS"
    ]
  },
  {
    "name": "5S_rRNA",
    "label": "5S ribosomal RNA (5S)",
    "definition": null,
    "parent": "Ribosomal_RNA",
    "alternativeLabels": [
      "5S",
      "5SrRNA",
      "RNA5S"
    ]
  },
  {
    "name": "Ribosomal_RNA",
    "label": "Ribosomal RNA (rRNA)",
    "definition": null,
    "parent": null,
    "alternativeLabels": [
      "rRNA"
    ]
  },
  {
    "name": "tufA",
    "label": "Elongation factor Tu (tufA)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "rpoB",
    "label": "RNA polymerase subunit B (rpoB)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "rpoC1",
    "label": "RNA polymerase subunit C1 (rpoC1)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "rpoC2",
    "label": "RNA polymerase subunit C2 (rpoC2)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "matK",
    "label": "Maturase K (matK)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "trnH",
    "label": "tRNA-His (trnH)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "trnL",
    "label": "tRNA-Leu (trnL)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "psbA",
    "label": "Photosystem II protein D1 (psbA)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "psbA",
      "PSBA",
      "PsbA"
    ]
  },
  {
    "name": "psbK",
    "label": "Photosystem II protein K (psbK)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "trnK",
    "label": "tRNA-Lys (TrnK)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "trnH_psbA_spacer",
    "label": "trnH-psbA intergenic spacer (trnH-psbA)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "atpB_rbcL_spacer",
    "label": "atpB-rbcL intergenic spacer (atpB-rbcL)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "trnL_trnF_spacer",
    "label": "trnL-trnF intergenic spacer (trnL-trnF)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "rbcL",
    "label": "Ribulose-bisphosphate carboxylase large chain (rbcL)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "ycf1",
    "label": "Hypothetical chloroplast reading frame 1 (ycf1)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "ycf1",
      "YCF1",
      "hypothetical chloroplast ORF1"
    ]
  },
  {
    "name": "ndhF",
    "label": "NADH dehydrogenase subunit F (ndhF)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "ndhF",
      "NDHF"
    ]
  },
  {
    "name": "psaB",
    "label": "Photosystem I P700 chlorophyll a apoprotein A2 (psaB)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "psaB",
      "PSAB"
    ]
  },
  {
    "name": "psbB",
    "label": "Photosystem II CP47 protein (psbB)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "psbB",
      "PSBB",
      "CP47"
    ]
  },
  {
    "name": "psbC",
    "label": "Photosystem II CP43 protein (psbC)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "psbC",
      "PSBC",
      "CP43"
    ]
  },
  {
    "name": "atpF_atpH_spacer",
    "label": "atpF-atpH intergenic spacer (atpF-atpH)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "atpF-atpH",
      "atpF/atpH",
      "atpF-atpH spacer"
    ]
  },
  {
    "name": "psbK_psbI_spacer",
    "label": "psbK-psbI intergenic spacer (psbK-psbI)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": [
      "psbK-psbI",
      "psbK/psbI",
      "psbK-psbI spacer"
    ]
  },
  {
    "name": "petD",
    "label": "Cytochrome b6/f complex subunit 4 (petD)",
    "definition": null,
    "parent": "Chloroplast_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "Chloroplast_protein_coding_gene",
    "label": "Chloroplast protein-coding gene",
    "definition": null,
    "parent": "Protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "CytB",
    "label": "Cytochrome b (CytB)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "CYB",
      "CYTB",
      "cytochromeb",
      "cyt-B"
    ]
  },
  {
    "name": "COI",
    "label": "Cytochrome c oxidase subunit I (COI)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "CO1",
      "COX1",
      "cox1",
      "MT-CO1"
    ]
  },
  {
    "name": "COII",
    "label": "Cytochrome c oxidase subunit II (COII)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "CO2",
      "COX2",
      "cox2",
      "MT-CO2"
    ]
  },
  {
    "name": "COIII",
    "label": "Cytochrome c oxidase subunit III (COIII)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "CO3",
      "COX3",
      "cox3",
      "MT-CO3"
    ]
  },
  {
    "name": "ND1",
    "label": "NADH dehydrogenase subunit 1 (ND1)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD1",
      "MT-ND1"
    ]
  },
  {
    "name": "ND2",
    "label": "NADH dehydrogenase subunit 2 (ND2)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD2",
      "MT-ND2"
    ]
  },
  {
    "name": "ND3",
    "label": "NADH dehydrogenase subunit 3 (ND3)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD3",
      "MT-ND3"
    ]
  },
  {
    "name": "ND4",
    "label": "NADH dehydrogenase subunit 4 (ND4)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD4",
      "MT-ND4"
    ]
  },
  {
    "name": "ND5",
    "label": "NADH dehydrogenase subunit 5 (ND5)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD5",
      "MT-ND5"
    ]
  },
  {
    "name": "ND6",
    "label": "NADH dehydrogenase subunit 6 (ND6)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD6",
      "MT-ND6"
    ]
  },
  {
    "name": "ND4L",
    "label": "NADH dehydrogenase subunit 4L (ND4L)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "NAD4L",
      "MT-ND4L"
    ]
  },
  {
    "name": "Dloop",
    "label": "Mitochondrial control region (Dloop)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "D-loop",
      "ControlRegion"
    ]
  },
  {
    "name": "atp6",
    "label": "ATP synthase F0 subunit 6 (atp6)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "ATP6",
      "MT-AP6"
    ]
  },
  {
    "name": "atp8",
    "label": "ATP synthase F0 subunit 8 (atp8)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "ATP8",
      "MT-ATP8"
    ]
  },
  {
    "name": "matR",
    "label": "Maturase R (matR)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "MutS_like",
    "label": "MutS-like protein (MutS-like)",
    "definition": null,
    "parent": "Mitochondrial_protein_coding_gene",
    "alternativeLabels": [
      "mtMutS"
    ]
  },
  {
    "name": "Mitochondrial_protein_coding_gene",
    "label": "Mitochondrial protein-coding gene",
    "definition": null,
    "parent": "Protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "nifH",
    "label": "Nitrogenase reductase (nifH)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "amoA",
    "label": "Ammonia monooxygenase subunit A (amoA)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "fbpA",
    "label": "Fructose-bisphosphate aldolase class II (fbpA)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": [
      "fbpA",
      "FBPA"
    ]
  },
  {
    "name": "hcpA",
    "label": "Hcp family protein A (hcpA)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": [
      "hcpA",
      "HCPA"
    ]
  },
  {
    "name": "ftsZ",
    "label": "Cell division protein FtsZ (ftsZ)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": [
      "ftsZ",
      "FTSZ"
    ]
  },
  {
    "name": "coxA",
    "label": "Cytochrome c oxidase subunit A (coxA)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": [
      "coxA",
      "COXA"
    ]
  },
  {
    "name": "gatB",
    "label": "Glutamyl-tRNA amidotransferase subunit B (gatB)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "Msp4",
    "label": "Major surface protein 4 (Msp4)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "ntcA",
    "label": "Global nitrogen regulator NtcA (ntcA)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "sca4",
    "label": "Surface cell antigen 4 (sca4)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "WSP",
    "label": "Wolbachia surface protein (WSP)",
    "definition": null,
    "parent": "Prokaryotic_protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "Prokaryotic_protein_coding_gene",
    "label": "Prokaryotic protein-coding gene",
    "definition": null,
    "parent": "Protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "TEF1",
    "label": "Translation elongation factor 1-alpha (TEF1)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "tef1",
      "tef1-\u03b1",
      "EF1a",
      "EF-1\u03b1",
      "EF1-alpha"
    ]
  },
  {
    "name": "RPB1",
    "label": "RNA polymerase II subunit 1 (RPB1)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "POLR2A"
    ]
  },
  {
    "name": "RPB2",
    "label": "RNA polymerase II subunit 2 (RPB2)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "POLR2B"
    ]
  },
  {
    "name": "beta_tubulin",
    "label": "Beta-tubulin (beta_tubilin)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "\u03b2-tubulin",
      "tub2",
      "benA"
    ]
  },
  {
    "name": "ACT",
    "label": "Actin (ACT)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "act"
    ]
  },
  {
    "name": "HSP90",
    "label": "Heat shock protein 90 (HSP90)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "hsp90"
    ]
  },
  {
    "name": "H3",
    "label": "Histone H3 (H3)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "Histone H3",
      "histone3"
    ]
  },
  {
    "name": "H4",
    "label": "Histone H4 (H4)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "H4",
      "Histone H4",
      "histone4"
    ]
  },
  {
    "name": "GAPDH",
    "label": "Glyceraldehyde-3-phosphate dehydrogenase (GAPDH)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "GAPDH",
      "gapdh"
    ]
  },
  {
    "name": "RAG1",
    "label": "Recombination activating gene 1 (RAG1)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "RAG1",
      "rag1"
    ]
  },
  {
    "name": "RAG2",
    "label": "Recombination activating gene 2 (RAG2)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "RAG2",
      "rag2"
    ]
  },
  {
    "name": "Wnt1",
    "label": "Wingless-type MMTV integration site family member 1 (Wnt1)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "Wnt1",
      "WNT1"
    ]
  },
  {
    "name": "S7",
    "label": "Ribosomal protein S7 (S7)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "S7",
      "RPS7"
    ]
  },
  {
    "name": "RHO",
    "label": "Rhodopsin (RHO)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "Rho",
      "RHO",
      "rhodopsin"
    ]
  },
  {
    "name": "c_mos",
    "label": "Proto-oncogene c-mos (c-mos)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "c-mos",
      "cmos"
    ]
  },
  {
    "name": "IRBP",
    "label": "Interphotoreceptor retinoid-binding protein (IRBP)",
    "definition": null,
    "parent": "Nuclear_protein_coding_gene",
    "alternativeLabels": [
      "IRBP",
      "RBP3"
    ]
  },
  {
    "name": "Nuclear_protein_coding_gene",
    "label": "Nuclear protein-coding gene",
    "definition": null,
    "parent": "Protein_coding_gene",
    "alternativeLabels": []
  },
  {
    "name": "E_gene",
    "label": "Envelope protein gene (E gene)",
    "definition": null,
    "parent": "Protein_coding_gene",
    "alternativeLabels": [
      "E gene",
      "e-gene",
      "Envelope gene"
    ]
  },
  {
    "name": "Protein_coding_gene",
    "label": "Protein_coding_gene",
    "definition": null,
    "parent": null,
    "alternativeLabels": []
  }
];
