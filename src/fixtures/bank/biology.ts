import { fmt, frac, mapping, type Template } from "./engine";

const B = { subject: "biology" as const, exams: ["neet"] as "neet"[], forms: ["single" as const] };

/** Probability that a cross Aa×.. / Bb×.. yields a given phenotype, computed by enumeration. */
function phenoProb(p1: string, p2: string, wantDomA: boolean, wantDomB: boolean) {
  const gametes = (g: string) => {
    const a = [g[0], g[1]], b = [g[2], g[3]];
    return a.flatMap((x) => b.map((y) => x + y));
  };
  let hit = 0, total = 0;
  for (const g1 of gametes(p1)) for (const g2 of gametes(p2)) {
    total++;
    const domA = g1[0] === "A" || g2[0] === "A";
    const domB = g1[1] === "B" || g2[1] === "B";
    if (domA === wantDomA && domB === wantDomB) hit++;
  }
  return [hit, total] as const;
}

export const biologyTemplates: Template[] = [
  {
    ...B, key: "bi_cross", chapter: "principles-of-inheritance-and-variation", topic: "mendelian-inheritance", difficulty: "medium", variants: 8,
    make: (r) => {
      const [p1, p2] = r.pick([["AaBb", "AaBb"], ["AaBb", "aabb"], ["AaBb", "Aabb"], ["AABb", "aaBb"], ["AaBB", "Aabb"]]);
      const [da, db] = r.pick([[true, true], [false, false], [true, false], [false, true]]);
      const [h, t] = phenoProb(p1, p2, da, db);
      const label = `${da ? "dominant" : "recessive"} for gene A and ${db ? "dominant" : "recessive"} for gene B`;
      const alt = [frac(h + 1, t), frac(Math.max(1, h - 1), t), frac(1, 4), frac(9, 16), frac(1, 16), frac(3, 16)];
      return {
        kind: "choice",
        stem: `In a cross $${p1} \\times ${p2}$ between two independently assorting genes with complete dominance, the fraction of offspring that are ${label} is`,
        correct: h === 0 ? "$0$" : `$${frac(h, t)}$`,
        wrong: alt.map((a) => `$${a}$`).filter((a) => a !== `$${frac(h, t)}$`),
        hint: "Treat each gene separately, find each probability, then multiply.",
        steps: [{ body: `Enumerating gametes: ${h} of ${t} combinations match, so the fraction is $${h === 0 ? "0" : frac(h, t)}$.` }],
      };
    },
  },
  {
    ...B, key: "bi_chargaff", chapter: "molecular-basis-of-inheritance", topic: "dna-replication", difficulty: "easy",
    make: (r) => {
      const a = r.pick([15, 18, 20, 22, 30, 35]);
      const g = (100 - 2 * a) / 2;
      return {
        kind: "value", unit: "\\%",
        stem: `A double-stranded DNA sample contains ${a}% adenine. The percentage of guanine in it is`,
        value: g, wrong: [a, 100 - a, 100 - 2 * a],
        hint: "Chargaff's rule: A = T and G = C in double-stranded DNA.",
        steps: [{ body: `$A = T = ${a}\\%$, so $G + C = ${100 - 2 * a}\\%$.` }, { body: `$G = ${g}\\%$.` }],
      };
    },
  },
  {
    ...B, key: "bi_codon", chapter: "molecular-basis-of-inheritance", topic: "genetic-code", difficulty: "easy",
    make: (r) => {
      const n = r.pick([50, 100, 120, 150, 200]);
      return {
        kind: "value",
        stem: `The minimum number of nucleotides in the coding region of an mRNA (including the stop codon) for a polypeptide of ${n} amino acids is`,
        value: 3 * n + 3, wrong: [3 * n, n + 1, 3 * n - 3],
        hint: "Each amino acid needs one codon of three bases; the stop codon codes for none.",
        steps: [{ body: `${n} codons for amino acids plus 1 stop codon: $3(${n} + 1) = ${3 * n + 3}$.` }],
      };
    },
  },
  {
    ...B, key: "bi_mitosis", chapter: "cell-cycle-and-cell-division", topic: "mitosis", difficulty: "medium",
    make: (r) => {
      const n2 = r.pick([8, 14, 16, 24, 46]);
      const q = r.pick(["anaphase", "metaphase-chromatids", "bivalents", "gamete"]);
      const [stem, v, wrong, why] =
        q === "anaphase"
          ? [`An organism has $2n = ${n2}$. The number of chromosomes in a cell at anaphase of mitosis is`, 2 * n2, [n2, n2 / 2, 4 * n2], `Sister chromatids separate at anaphase, so each becomes a chromosome: $2 \\times ${n2} = ${2 * n2}$.`]
          : q === "metaphase-chromatids"
            ? [`An organism has $2n = ${n2}$. The number of chromatids in a cell at metaphase of mitosis is`, 2 * n2, [n2, n2 / 2, 4 * n2], `Each of the ${n2} chromosomes has two chromatids: ${2 * n2}.`]
            : q === "bivalents"
              ? [`An organism has $2n = ${n2}$. The number of bivalents formed at prophase I of meiosis is`, n2 / 2, [n2, 2 * n2, n2 / 4 === Math.floor(n2 / 4) ? n2 / 4 : n2 / 2 + 1], `Homologous pairs form bivalents: $${n2}/2 = ${n2 / 2}$.`]
              : [`An organism has $2n = ${n2}$. The number of chromosomes in each of its gametes is`, n2 / 2, [n2, 2 * n2, n2 / 2 + 2], `Meiosis halves the chromosome number: $n = ${n2 / 2}$.`];
      return { kind: "value", stem, value: v, wrong: wrong as number[], hint: "Track chromosomes and chromatids separately through each phase.", steps: [{ body: why as string }] };
    },
  },
  {
    ...B, key: "bi_seeds", chapter: "sexual-reproduction-in-flowering-plants", topic: "double-fertilisation", difficulty: "hard",
    make: (r) => {
      const n = r.pick([20, 40, 100, 200]);
      const which = r.pick(["pollen", "seeds"]);
      const v = which === "pollen" ? n / 4 : n + n / 4;
      return {
        kind: "value",
        stem: `The minimum number of meiotic divisions required to produce ${n} ${which === "pollen" ? "pollen grains" : "viable seeds in an angiosperm"} is`,
        value: v, wrong: which === "pollen" ? [n, n / 2, n * 2] : [n, n / 4, n * 2],
        hint: "One meiosis gives four microspores but only one functional megaspore.",
        steps:
          which === "pollen"
            ? [{ body: `Each microspore mother cell gives 4 pollen grains: $${n}/4 = ${v}$.` }]
            : [{ body: `${n} seeds need ${n} eggs (one meiosis each) and ${n} pollen grains ($${n}/4 = ${n / 4}$ meioses).` }, { body: `Total $= ${n} + ${n / 4} = ${v}$.` }],
      };
    },
  },
  {
    ...B, key: "bi_calvin", chapter: "photosynthesis-in-higher-plants", topic: "calvin-cycle", difficulty: "medium",
    make: (r) => {
      const n = r.pick([1, 2, 3, 5]);
      const which = r.pick(["ATP", "NADPH"]);
      const per = which === "ATP" ? 18 : 12;
      return {
        kind: "value",
        stem: `The number of ${which} molecules needed in the Calvin cycle to synthesise ${n === 1 ? "one molecule" : n + " molecules"} of glucose is`,
        value: per * n, wrong: [(which === "ATP" ? 12 : 18) * n, 6 * n, (per / 2) * n],
        hint: "Fixing one $\\text{CO}_2$ needs 3 ATP and 2 NADPH; glucose needs six turns.",
        steps: [{ body: `Per glucose: 18 ATP and 12 NADPH. For ${n}: ${which} $= ${per} \\times ${n} = ${per * n}$.` }],
      };
    },
  },
  {
    ...B, key: "bi_tenpct", chapter: "ecosystem", topic: "energy-flow", difficulty: "easy",
    make: (r) => {
      const E = r.pick([10000, 20000, 50000, 100000]);
      const lvl = r.pick([["primary consumers", 1], ["secondary consumers", 2], ["tertiary consumers", 3]] as [string, number][]);
      const v = E / 10 ** lvl[1];
      return {
        kind: "value", unit: "J",
        stem: `Producers in an ecosystem fix $${E}\\,\\text{J}$ of energy. Following the 10 per cent law, the energy available to ${lvl[0]} is`,
        value: v, wrong: [v * 10, v / 10, E / 2],
        hint: "Only about a tenth of the energy passes from one trophic level to the next.",
        steps: [{ body: `${lvl[1]} transfer${lvl[1] > 1 ? "s" : ""}: $${E} \\times (0.1)^{${lvl[1]}} = ${fmt(v)}\\,\\text{J}$.` }],
      };
    },
  },
  mapping(
    { ...B, key: "bi_hormone_pl", chapter: "plant-growth-and-development", topic: "plant-growth-regulators", difficulty: "easy" },
    [
      ["promotes stomatal closure during water stress", "Abscisic acid", "ABA is the stress hormone that closes stomata."],
      ["is a gaseous hormone that promotes fruit ripening", "Ethylene", "Ethylene is gaseous and hastens ripening."],
      ["causes bolting (internode elongation) in rosette plants", "Gibberellin", "Gibberellins promote internode elongation just before flowering."],
      ["promotes cell division and delays leaf senescence", "Cytokinin", "Cytokinins promote cytokinesis and delay senescence."],
      ["causes apical dominance", "Auxin", "Auxin from the shoot apex suppresses lateral buds."],
    ],
    (s) => `The plant growth regulator that ${s} is`,
    "Match each hormone with its signature effect.",
  ),
  mapping(
    { ...B, key: "bi_kingdom", chapter: "biological-classification", topic: "five-kingdom-classification", difficulty: "easy" },
    [
      ["Yeast", "Fungi", "Yeast is a unicellular fungus."],
      ["Nostoc", "Monera", "Nostoc is a cyanobacterium, a prokaryote."],
      ["Euglena", "Protista", "Euglena is a unicellular eukaryote (euglenoid)."],
      ["Penicillium", "Fungi", "Penicillium is a mould, a fungus."],
      ["Mycoplasma", "Monera", "Mycoplasma is a wall-less bacterium."],
      ["Amoeba", "Protista", "Amoeba is a protozoan protist."],
      ["Funaria", "Plantae", "Funaria is a moss, a bryophyte."],
    ],
    (o) => `In Whittaker's five-kingdom classification, ${o} is placed in the kingdom`,
    "Prokaryotes → Monera; unicellular eukaryotes → Protista; heterotrophs with chitin walls → Fungi.",
  ),
  mapping(
    { ...B, key: "bi_organelle", chapter: "cell-the-unit-of-life", topic: "cell-organelles", difficulty: "easy" },
    [
      ["the site of aerobic respiration", "Mitochondrion", "The Krebs cycle and ETS take place in mitochondria."],
      ["the site of protein synthesis", "Ribosome", "Ribosomes translate mRNA into protein."],
      ["rich in hydrolytic enzymes active at acidic pH", "Lysosome", "Lysosomes contain acid hydrolases."],
      ["the main site of lipid synthesis", "Smooth endoplasmic reticulum", "SER synthesises lipids and steroids."],
      ["responsible for packaging and secretion of materials", "Golgi apparatus", "The Golgi modifies, packages and dispatches products."],
      ["the site of photosynthesis", "Chloroplast", "Chloroplasts hold the light reactions and the Calvin cycle."],
    ],
    (s) => `The cell organelle that is ${s} is the`,
    "Think about the organelle's enzymes and membranes.",
  ),
  {
    ...B, key: "bi_hw", chapter: "evolution", topic: "hardy-weinberg-principle", difficulty: "medium",
    make: (r) => {
      const q = r.pick([0.1, 0.2, 0.3, 0.4]);
      const p = 1 - q;
      const het = 2 * p * q * 100;
      return {
        kind: "value", unit: "\\%",
        stem: `In a population in Hardy–Weinberg equilibrium, ${fmt(q * q * 100)}% of individuals show a recessive trait. The percentage of heterozygous carriers is`,
        value: Number(het.toFixed(0)), wrong: [Number((p * p * 100).toFixed(0)), Number((q * 100).toFixed(0)), Number((p * q * 100).toFixed(0))],
        hint: "The recessive phenotype frequency is $q^2$. Find $q$, then $p$, then $2pq$.",
        steps: [{ body: `$q^2 = ${fmt(q * q)} \\Rightarrow q = ${q}$, $p = ${fmt(p)}$.` }, { body: `$2pq = 2(${fmt(p)})(${q}) = ${fmt(2 * p * q)} = ${fmt(het)}\\%$.` }],
      };
    },
  },
  {
    ...B, key: "bi_co", chapter: "body-fluids-and-circulation", topic: "cardiac-cycle", difficulty: "easy",
    make: (r) => {
      const hr = r.pick([60, 70, 72, 75, 80]);
      const sv = r.pick([60, 70, 80]);
      const co = (hr * sv) / 1000;
      return {
        kind: "value", unit: "L min^{-1}",
        stem: `A person has a heart rate of ${hr} beats per minute and a stroke volume of $${sv}\\,\\text{mL}$. The cardiac output is`,
        value: co, wrong: [co * 2, (hr + sv) / 10, co / 2],
        hint: "Cardiac output is the volume pumped per beat times beats per minute.",
        steps: [{ body: `$${hr} \\times ${sv} = ${hr * sv}\\,\\text{mL min}^{-1} = ${fmt(co)}\\,\\text{L min}^{-1}$.` }],
      };
    },
  },
  {
    ...B, key: "bi_vc", chapter: "breathing-and-exchange-of-gases", topic: "respiratory-volumes", difficulty: "easy",
    make: (r) => {
      const tv = 500, irv = r.pick([2500, 2800, 3000]), erv = r.pick([1000, 1100]);
      const vc = tv + irv + erv;
      return {
        kind: "value", unit: "mL",
        stem: `A person has tidal volume $${tv}\\,\\text{mL}$, inspiratory reserve volume $${irv}\\,\\text{mL}$ and expiratory reserve volume $${erv}\\,\\text{mL}$. Their vital capacity is`,
        value: vc, wrong: [irv + erv, vc + 1200, tv + irv],
        hint: "Vital capacity is the most air you can breathe out after a maximal inspiration.",
        steps: [{ body: `$VC = TV + IRV + ERV = ${tv} + ${irv} + ${erv} = ${vc}\\,\\text{mL}$.` }],
      };
    },
  },
  {
    ...B, key: "bi_peptide", chapter: "biomolecules", topic: "proteins", difficulty: "easy",
    make: (r) => {
      const n = r.pick([51, 100, 124, 150, 300]);
      const k = r.pick([1, 2, 4]);
      const v = n - k;
      return {
        kind: "value",
        stem: `A protein made of ${k === 1 ? "a single polypeptide chain" : k + " polypeptide chains"} contains ${n} amino acids in total. The number of peptide bonds in it is`,
        value: v, wrong: [n, n - 1 === v ? n + 1 : n - 1, n * k],
        hint: "Each chain of $m$ amino acids has $m - 1$ peptide bonds.",
        steps: [{ body: `Bonds $= n - (\\text{number of chains}) = ${n} - ${k} = ${v}$.` }],
      };
    },
  },
  mapping(
    { ...B, key: "bi_gland", chapter: "chemical-coordination-and-integration", topic: "endocrine-glands", difficulty: "easy" },
    [
      ["Insulin", "Pancreas", "β-cells of the islets of Langerhans in the pancreas secrete insulin."],
      ["Thyroxine", "Thyroid", "Follicular cells of the thyroid secrete thyroxine."],
      ["Melatonin", "Pineal gland", "The pineal gland secretes melatonin."],
      ["Adrenaline", "Adrenal medulla", "The adrenal medulla secretes adrenaline and noradrenaline."],
      ["Parathyroid hormone", "Parathyroid", "PTH raises blood calcium."],
      ["Cortisol", "Adrenal cortex", "The zona fasciculata of the adrenal cortex secretes glucocorticoids."],
      ["Thymosins", "Thymus", "The thymus secretes thymosins for T-cell maturation."],
    ],
    (h) => `${h} is secreted by the`,
    "Recall each endocrine gland's signature hormone.",
  ),
  mapping(
    { ...B, key: "bi_disease", chapter: "human-health-and-disease", topic: "common-diseases", difficulty: "easy" },
    [
      ["Typhoid", "Salmonella typhi", "Typhoid is caused by the bacterium Salmonella typhi."],
      ["Malaria", "Plasmodium", "Malaria is caused by the protozoan Plasmodium."],
      ["Amoebiasis", "Entamoeba histolytica", "Amoebic dysentery is caused by Entamoeba histolytica."],
      ["Filariasis", "Wuchereria", "Elephantiasis is caused by the filarial worm Wuchereria."],
      ["Ascariasis", "Ascaris", "Ascariasis is caused by the roundworm Ascaris."],
      ["Pneumonia", "Streptococcus pneumoniae", "Bacterial pneumonia is commonly caused by Streptococcus pneumoniae."],
    ],
    (d) => `${d} is caused by`,
    "Bacteria, protozoans and helminths each cause characteristic diseases.",
  ),
  mapping(
    { ...B, key: "bi_phylum", chapter: "animal-kingdom", topic: "non-chordates", difficulty: "easy" },
    [
      ["Hydra", "Cnidaria", "Hydra has cnidoblasts and a diploblastic body."],
      ["Earthworm", "Annelida", "Metamerically segmented body: Annelida."],
      ["Starfish", "Echinodermata", "Water vascular system and tube feet: Echinodermata."],
      ["Octopus", "Mollusca", "Soft-bodied with a mantle: Mollusca."],
      ["Cockroach", "Arthropoda", "Jointed appendages and chitinous exoskeleton: Arthropoda."],
      ["Planaria", "Platyhelminthes", "Dorso-ventrally flattened flatworm with flame cells."],
      ["Sycon", "Porifera", "Sponges have ostia, a spongocoel and choanocytes."],
    ],
    (a) => `${a} belongs to the phylum`,
    "Identify the defining body-plan feature of each animal.",
  ),
  mapping(
    { ...B, key: "bi_biotech", chapter: "biotechnology-principles-and-processes", topic: "restriction-enzymes", difficulty: "medium" },
    [
      ["cuts DNA at a specific palindromic sequence", "EcoRI", "EcoRI is a restriction endonuclease."],
      ["joins DNA fragments by forming phosphodiester bonds", "DNA ligase", "Ligase seals nicks in the sugar–phosphate backbone."],
      ["is a thermostable DNA polymerase used in PCR", "Taq polymerase", "Taq polymerase from Thermus aquaticus survives denaturation."],
      ["delivers genes into dicot plants using its Ti plasmid", "Agrobacterium tumefaciens", "Its Ti plasmid is a natural plant vector."],
      ["is the source of the cry genes used in Bt cotton", "Bacillus thuringiensis", "Bt produces insecticidal Cry proteins."],
    ],
    (s) => `In recombinant DNA technology, the tool or organism that ${s} is`,
    "Match each biotechnology tool with its job.",
  ),
];
