/**
 * MOCK FIXTURE — syllabus taxonomy for UI development.
 * Chapter lists follow the public NTA JEE Main / NEET UG syllabus units; the
 * canonical taxonomy (slugs, topics, exam mapping) is owned by Person 2.
 */
import type { Chapter, ExamId, Subject } from "@/contracts";

export const subjects: Subject[] = [
  {
    id: "physics",
    name: "Physics",
    summary:
      "Mechanics, electromagnetism, optics and modern physics: the problems where a clean diagram and the right conservation law do most of the work.",
  },
  {
    id: "chemistry",
    name: "Chemistry",
    summary:
      "Physical, inorganic and organic chemistry. Calculation-heavy physical chemistry sits alongside recall-heavy inorganic trends and mechanism-driven organic.",
  },
  {
    id: "mathematics",
    name: "Mathematics",
    summary:
      "Algebra, calculus, coordinate and 3D geometry, vectors, probability and trigonometry. Usually the longest section to solve.",
  },
  {
    id: "biology",
    name: "Biology",
    summary:
      "Botany and Zoology from the NCERT syllabus: half of the NEET paper. Precise recall of processes, structures and terminology matters most.",
  },
];

type C = [slug: string, name: string, grade: 11 | 12, summary: string, topics: string[], group?: string];

const ALL: ExamId[] = ["jee-main", "jee-advanced", "neet"];
const JEE: ExamId[] = ["jee-main", "jee-advanced"];
const NEET: ExamId[] = ["neet"];

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const build = (subject: Chapter["subject"], exams: ExamId[], rows: C[]): Chapter[] =>
  rows.map(([slug, name, grade, summary, topics, group]) => ({
    slug,
    name,
    subject,
    exams,
    ...(group ? { group } : {}),
    grade,
    summary,
    topics: topics.map((t) => ({ slug: slugify(t), name: t })),
  }));

export const chapters: Chapter[] = [
  ...build("physics", ALL, [
    ["units-and-measurements", "Units and Measurements", 11, "SI units, dimensional analysis, significant figures and error propagation.", ["Dimensional analysis", "Errors in measurement", "Significant figures"]],
    ["kinematics", "Kinematics", 11, "Motion in one and two dimensions, relative velocity and projectile motion.", ["Motion in a straight line", "Projectile motion", "Relative velocity"]],
    ["laws-of-motion", "Laws of Motion", 11, "Newton's laws, friction, and circular-motion dynamics.", ["Newton's laws", "Friction", "Circular motion"]],
    ["work-energy-and-power", "Work, Energy and Power", 11, "Work-energy theorem, conservative forces, power and collisions.", ["Work-energy theorem", "Potential energy", "Collisions"]],
    ["rotational-motion", "Rotational Motion", 11, "Centre of mass, torque, moment of inertia and rolling.", ["Centre of mass", "Moment of inertia", "Rolling motion"]],
    ["gravitation", "Gravitation", 11, "Universal gravitation, orbital motion and escape velocity.", ["Gravitational potential", "Orbital motion", "Kepler's laws"]],
    ["properties-of-solids-and-liquids", "Properties of Solids and Liquids", 11, "Elasticity, fluid statics and dynamics, surface tension, viscosity and heat transfer.", ["Elasticity", "Fluid mechanics", "Surface tension", "Calorimetry"]],
    ["thermodynamics", "Thermodynamics", 11, "Laws of thermodynamics, thermodynamic processes and heat engines.", ["First law", "Thermodynamic processes", "Heat engines"]],
    ["kinetic-theory-of-gases", "Kinetic Theory of Gases", 11, "Ideal gas behaviour, degrees of freedom and equipartition.", ["Ideal gas equation", "RMS speed", "Equipartition of energy"]],
    ["oscillations-and-waves", "Oscillations and Waves", 11, "Simple harmonic motion, wave motion, superposition and the Doppler effect.", ["Simple harmonic motion", "Standing waves", "Doppler effect"]],
    ["electrostatics", "Electrostatics", 12, "Coulomb's law, electric fields and potential, Gauss's law and capacitors.", ["Coulomb's law", "Electric field", "Gauss's law", "Electric potential", "Capacitors"]],
    ["current-electricity", "Current Electricity", 12, "Ohm's law, Kirchhoff's rules, cells and measuring instruments.", ["Kirchhoff's laws", "Wheatstone bridge", "Cells in series and parallel"]],
    ["magnetic-effects-of-current-and-magnetism", "Magnetic Effects of Current and Magnetism", 12, "Biot–Savart and Ampère's laws, forces on charges and currents, magnetic materials.", ["Biot–Savart law", "Force on a moving charge", "Magnetic materials"]],
    ["electromagnetic-induction-and-alternating-currents", "Electromagnetic Induction and Alternating Currents", 12, "Faraday's law, inductance, AC circuits and resonance.", ["Faraday's law", "Self and mutual inductance", "LCR circuits"]],
    ["electromagnetic-waves", "Electromagnetic Waves", 12, "Displacement current, EM spectrum and wave properties.", ["Displacement current", "EM spectrum"]],
    ["optics", "Optics", 12, "Ray optics, optical instruments and wave optics.", ["Reflection and refraction", "Lenses and mirrors", "Interference", "Diffraction"]],
    ["dual-nature-of-matter-and-radiation", "Dual Nature of Matter and Radiation", 12, "Photoelectric effect and de Broglie waves.", ["Photoelectric effect", "de Broglie wavelength"]],
    ["atoms-and-nuclei", "Atoms and Nuclei", 12, "Bohr model, spectra, nuclear binding energy and radioactivity.", ["Bohr model", "Radioactive decay", "Binding energy"]],
    ["electronic-devices", "Electronic Devices", 12, "Semiconductors, p–n junctions and logic gates.", ["p–n junction", "Logic gates"]],
  ]),
  ...build("chemistry", ALL, [
    ["some-basic-concepts-in-chemistry", "Some Basic Concepts in Chemistry", 11, "The mole concept, stoichiometry and concentration terms.", ["Mole concept", "Stoichiometry", "Concentration terms"]],
    ["atomic-structure", "Atomic Structure", 11, "Quantum numbers, orbitals and electronic configuration.", ["Bohr model", "Quantum numbers", "Electronic configuration"]],
    ["chemical-bonding-and-molecular-structure", "Chemical Bonding and Molecular Structure", 11, "VSEPR, hybridisation, molecular orbital theory and hydrogen bonding.", ["VSEPR theory", "Hybridisation", "Molecular orbital theory"]],
    ["chemical-thermodynamics", "Chemical Thermodynamics", 11, "Enthalpy, entropy, Gibbs energy and spontaneity.", ["Enthalpy", "Entropy", "Gibbs energy"]],
    ["solutions", "Solutions", 12, "Concentration, Raoult's law and colligative properties.", ["Raoult's law", "Colligative properties"]],
    ["equilibrium", "Equilibrium", 11, "Chemical and ionic equilibrium, pH and buffers.", ["Le Chatelier's principle", "pH and buffers", "Solubility product"]],
    ["redox-reactions-and-electrochemistry", "Redox Reactions and Electrochemistry", 12, "Oxidation states, electrochemical cells and the Nernst equation.", ["Balancing redox", "Nernst equation", "Conductance"]],
    ["chemical-kinetics", "Chemical Kinetics", 12, "Rate laws, order of reaction and the Arrhenius equation.", ["Rate law", "Integrated rate equations", "Arrhenius equation"]],
    ["classification-of-elements-and-periodicity", "Classification of Elements and Periodicity", 11, "Periodic trends in size, ionisation energy and electronegativity.", ["Atomic radius", "Ionisation enthalpy", "Electronegativity"]],
    ["p-block-elements", "p-Block Elements", 12, "Groups 13–18: trends, important compounds and anomalies.", ["Group 15", "Group 16", "Group 17", "Noble gases"]],
    ["d-and-f-block-elements", "d- and f-Block Elements", 12, "Transition metals, lanthanoids and important compounds.", ["Transition metal properties", "Lanthanoid contraction"]],
    ["coordination-compounds", "Coordination Compounds", 12, "Werner's theory, nomenclature, isomerism and crystal field theory.", ["Nomenclature", "Isomerism", "Crystal field theory"]],
    ["purification-and-characterisation-of-organic-compounds", "Purification and Characterisation of Organic Compounds", 11, "Separation techniques and qualitative/quantitative analysis.", ["Chromatography", "Estimation of elements"]],
    ["some-basic-principles-of-organic-chemistry", "Some Basic Principles of Organic Chemistry", 11, "Nomenclature, isomerism, electronic effects and reaction intermediates.", ["IUPAC nomenclature", "Electronic effects", "Reaction intermediates"]],
    ["hydrocarbons", "Hydrocarbons", 11, "Alkanes, alkenes, alkynes and aromatic hydrocarbons.", ["Alkenes", "Alkynes", "Aromaticity"]],
    ["organic-compounds-containing-halogens", "Organic Compounds Containing Halogens", 12, "Haloalkanes and haloarenes; SN1/SN2 mechanisms.", ["SN1 and SN2", "Haloarenes"]],
    ["organic-compounds-containing-oxygen", "Organic Compounds Containing Oxygen", 12, "Alcohols, phenols, ethers, aldehydes, ketones and carboxylic acids.", ["Alcohols and phenols", "Carbonyl compounds", "Carboxylic acids"]],
    ["organic-compounds-containing-nitrogen", "Organic Compounds Containing Nitrogen", 12, "Amines and diazonium salts.", ["Amines", "Diazonium salts"]],
    ["biomolecules", "Biomolecules", 12, "Carbohydrates, proteins, vitamins and nucleic acids.", ["Carbohydrates", "Proteins", "Nucleic acids"]],
  ]),
  ...build("mathematics", JEE, [
    ["sets-relations-and-functions", "Sets, Relations and Functions", 11, "Types of relations and functions, composition and inverses.", ["Relations", "Types of functions", "Composition"]],
    ["complex-numbers-and-quadratic-equations", "Complex Numbers and Quadratic Equations", 11, "Argand plane, modulus–argument form and the theory of quadratics.", ["Argand plane", "Roots of quadratics"]],
    ["matrices-and-determinants", "Matrices and Determinants", 12, "Matrix algebra, determinants, inverses and linear systems.", ["Determinants", "Inverse of a matrix", "Systems of equations"]],
    ["permutations-and-combinations", "Permutations and Combinations", 11, "Counting principles, arrangements and selections.", ["Fundamental principle", "Arrangements", "Selections"]],
    ["binomial-theorem", "Binomial Theorem", 11, "General and middle terms, binomial coefficients.", ["General term", "Properties of coefficients"]],
    ["sequences-and-series", "Sequences and Series", 11, "AP, GP and special series.", ["Arithmetic progression", "Geometric progression", "AM–GM inequality"]],
    ["limits-continuity-and-differentiability", "Limits, Continuity and Differentiability", 12, "Limits, continuity, derivatives and applications of derivatives.", ["Limits", "Continuity", "Applications of derivatives"]],
    ["integral-calculus", "Integral Calculus", 12, "Indefinite and definite integrals and area under curves.", ["Indefinite integrals", "Definite integrals", "Area under curves"]],
    ["differential-equations", "Differential Equations", 12, "Order, degree and solving first-order equations.", ["Variable separable", "Linear differential equations"]],
    ["coordinate-geometry", "Coordinate Geometry", 11, "Straight lines, circles and conic sections.", ["Straight lines", "Circles", "Conic sections"]],
    ["three-dimensional-geometry", "Three Dimensional Geometry", 12, "Lines and planes in space, distances and angles.", ["Lines in space", "Planes"]],
    ["vector-algebra", "Vector Algebra", 12, "Dot and cross products, scalar triple product.", ["Dot product", "Cross product", "Scalar triple product"]],
    ["statistics-and-probability", "Statistics and Probability", 11, "Dispersion, conditional probability, Bayes' theorem and distributions.", ["Measures of dispersion", "Conditional probability", "Bayes' theorem"]],
    ["trigonometry", "Trigonometry", 11, "Identities, equations and inverse trigonometric functions.", ["Trigonometric identities", "Trigonometric equations", "Inverse trigonometric functions"]],
  ]),
  ...build("biology", NEET, [
    ["the-living-world", "The Living World", 11, "What it means to be alive, taxonomic categories and binomial nomenclature.", ["Taxonomic categories", "Binomial nomenclature"], "Botany"],
    ["biological-classification", "Biological Classification", 11, "Whittaker's five kingdoms, viruses, viroids and lichens.", ["Five-kingdom classification", "Monera and Protista", "Fungi", "Viruses"], "Botany"],
    ["plant-kingdom", "Plant Kingdom", 11, "Algae, bryophytes, pteridophytes, gymnosperms and angiosperms; plant life cycles.", ["Algae", "Bryophytes", "Pteridophytes", "Gymnosperms"], "Botany"],
    ["morphology-of-flowering-plants", "Morphology of Flowering Plants", 11, "Root, stem, leaf, inflorescence, flower, fruit and seed; floral formulae.", ["Inflorescence", "Flower", "Floral formula"], "Botany"],
    ["anatomy-of-flowering-plants", "Anatomy of Flowering Plants", 11, "Tissues and tissue systems, anatomy of dicot and monocot organs, and secondary growth.", ["Meristems", "Tissue systems", "Secondary growth"], "Botany"],
    ["cell-the-unit-of-life", "Cell: The Unit of Life", 11, "Cell theory, prokaryotic and eukaryotic cells, and cell organelles.", ["Cell theory", "Cell organelles", "Prokaryotic cells"], "Botany"],
    ["cell-cycle-and-cell-division", "Cell Cycle and Cell Division", 11, "Phases of the cell cycle, mitosis and meiosis, and their significance.", ["Cell cycle", "Mitosis", "Meiosis"], "Botany"],
    ["photosynthesis-in-higher-plants", "Photosynthesis in Higher Plants", 11, "Light reactions, the Calvin cycle, the C4 pathway and photorespiration.", ["Light reactions", "Calvin cycle", "C4 pathway"], "Botany"],
    ["respiration-in-plants", "Respiration in Plants", 11, "Glycolysis, fermentation, the Krebs cycle and the electron transport system.", ["Glycolysis", "Krebs cycle", "Respiratory quotient"], "Botany"],
    ["plant-growth-and-development", "Plant Growth and Development", 11, "Growth phases, differentiation and plant growth regulators.", ["Plant growth regulators", "Photoperiodism"], "Botany"],
    ["sexual-reproduction-in-flowering-plants", "Sexual Reproduction in Flowering Plants", 12, "Microsporogenesis, megasporogenesis, pollination and double fertilisation.", ["Pollination", "Double fertilisation", "Embryo development"], "Botany"],
    ["principles-of-inheritance-and-variation", "Principles of Inheritance and Variation", 12, "Mendel's laws, deviations, linkage, sex determination and genetic disorders.", ["Mendelian inheritance", "Linkage", "Genetic disorders"], "Botany"],
    ["molecular-basis-of-inheritance", "Molecular Basis of Inheritance", 12, "DNA structure and replication, transcription, the genetic code and translation.", ["DNA replication", "Transcription", "Genetic code"], "Botany"],
    ["microbes-in-human-welfare", "Microbes in Human Welfare", 12, "Microbes in food, industry, sewage treatment, biogas and biocontrol.", ["Industrial products", "Biocontrol agents"], "Botany"],
    ["organisms-and-populations", "Organisms and Populations", 12, "Population attributes, growth models and population interactions.", ["Population growth", "Population interactions"], "Botany"],
    ["ecosystem", "Ecosystem", 12, "Productivity, decomposition, energy flow and ecological pyramids.", ["Energy flow", "Ecological pyramids"], "Botany"],
    ["biodiversity-and-conservation", "Biodiversity and Conservation", 12, "Patterns of biodiversity, its loss, and in-situ and ex-situ conservation.", ["Patterns of biodiversity", "Conservation"], "Botany"],
    ["animal-kingdom", "Animal Kingdom", 11, "Basis of classification and the major animal phyla.", ["Basis of classification", "Non-chordates", "Chordates"], "Zoology"],
    ["structural-organisation-in-animals", "Structural Organisation in Animals", 11, "Animal tissues and the morphology and anatomy of the frog.", ["Animal tissues", "Frog"], "Zoology"],
    ["biomolecules", "Biomolecules", 11, "Proteins, carbohydrates, lipids, nucleic acids and enzymes.", ["Proteins", "Enzymes", "Nucleic acids"], "Zoology"],
    ["breathing-and-exchange-of-gases", "Breathing and Exchange of Gases", 11, "Respiratory volumes, gas exchange and transport of gases.", ["Respiratory volumes", "Transport of gases"], "Zoology"],
    ["body-fluids-and-circulation", "Body Fluids and Circulation", 11, "Blood, lymph, the cardiac cycle and double circulation.", ["Blood groups", "Cardiac cycle", "ECG"], "Zoology"],
    ["excretory-products-and-their-elimination", "Excretory Products and their Elimination", 11, "Nephron structure, urine formation and regulation of kidney function.", ["Nephron", "Urine formation"], "Zoology"],
    ["locomotion-and-movement", "Locomotion and Movement", 11, "Muscle contraction, the skeletal system and joints.", ["Muscle contraction", "Skeletal system"], "Zoology"],
    ["neural-control-and-coordination", "Neural Control and Coordination", 11, "Neurons, nerve impulse transmission and the central nervous system.", ["Nerve impulse", "Synapse", "Brain"], "Zoology"],
    ["chemical-coordination-and-integration", "Chemical Coordination and Integration", 11, "Endocrine glands, hormones and their mechanisms of action.", ["Endocrine glands", "Hormone action"], "Zoology"],
    ["human-reproduction", "Human Reproduction", 12, "Reproductive systems, gametogenesis, the menstrual cycle and pregnancy.", ["Gametogenesis", "Menstrual cycle"], "Zoology"],
    ["reproductive-health", "Reproductive Health", 12, "Contraception, sexually transmitted infections, infertility and assisted reproduction.", ["Contraception", "Assisted reproduction"], "Zoology"],
    ["evolution", "Evolution", 12, "Origin of life, evidence for evolution, the Hardy–Weinberg principle and human evolution.", ["Evidence for evolution", "Hardy–Weinberg principle"], "Zoology"],
    ["human-health-and-disease", "Human Health and Disease", 12, "Common diseases, immunity, AIDS, cancer and drug abuse.", ["Common diseases", "Immunity"], "Zoology"],
    ["biotechnology-principles-and-processes", "Biotechnology: Principles and Processes", 12, "Restriction enzymes, cloning vectors, PCR and recombinant DNA technology.", ["Restriction enzymes", "Cloning vectors", "PCR"], "Zoology"],
    ["biotechnology-and-its-applications", "Biotechnology and its Applications", 12, "Bt crops, RNA interference, gene therapy and biosafety.", ["Bt crops", "Gene therapy"], "Zoology"],
  ]),
];
