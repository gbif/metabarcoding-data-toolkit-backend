// Markers supported by the sequence ID service.
//
// `concepts` lists the GBIF target_gene vocabulary concepts this marker covers. target_gene is
// now vocabulary-constrained, so a dataset's stored value is a concept name like
// SSU_rRNA_16S_prokaryotic - not the short form these entries are keyed by. Without this
// mapping the gate in classifier/index.js would reject every vocabulary value.
//
// Note what the mapping makes explicit: 16s blasts against a prokaryotic-only database, which
// is why a bare "16S" is resolved to the prokaryotic concept rather than the plastid or
// mitochondrial one.

const markers = [
    {
        name: "coi",
        concepts: ["COI"],
        database: "BOLD Public Database v2025-10-17"
    },
    {
       name:  "its",
        concepts: ["ITS_region"],
       database: "UNITE general FASTA release for eukaryotes v9.0"
    },
    {
        name:  "its1",
        concepts: ["ITS1"],
        database: "UNITE general FASTA release for eukaryotes v9.0"
     },
    {
        name:  "its2",
        concepts: ["ITS2"],
        database: "UNITE general FASTA release for eukaryotes v9.0"
     },
    {
        name: "16s",
        concepts: ["SSU_rRNA_16S_prokaryotic"],
        database: "Genome Taxonomy Database r207"
    },
    {
        name: "12s",
        concepts: ["SSU_rRNA_12S_mitochondrial"],
        database: "MitoFish v41"
    },
    {
        name: "18s",
        concepts: ["SSU_rRNA_18S_eukaryotic"],
        database: " PR2 database v5.0.0"
    }
    
];

export default markers;

/**
 * Resolves a stored target_gene value to the marker the sequence ID service understands.
 * Accepts both a vocabulary concept name and the legacy short form, so datasets mapped before
 * the vocabulary was wired in keep working. Returns the marker entry, or null.
 */
export const resolveSupportedMarker = (value) => {
    const needle = `${value ?? ''}`.trim().toLowerCase();
    if (!needle) {
        return null;
    }
    return markers.find(m =>
        m.name === needle ||
        (m.concepts || []).some(c => c.toLowerCase() === needle)
    ) || null;
};
