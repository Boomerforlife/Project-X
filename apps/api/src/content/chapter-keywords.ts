/**
 * Deterministic chapter classifier for JEE Main questions (no AI). Each chapter has signature terms; a question's text
 * (OCR of the question image for previous-year papers, so stems are used where OCR drops letters) is scored per chapter
 * within its known subject, and a chapter is assigned only when one clearly wins (`confident`). Everything else is left
 * for a person. Accuracy is measured against already-tagged questions before any run (apps/api/src/jobs/pyq-official.ts).
 *
 * Term syntax: "!term" decisive (4), "term" normal (2), "~term" weak (1). Terms of 3 characters or fewer, and terms
 * starting with "=", match whole words only; longer terms match as substrings (stems like "llips" survive OCR damage).
 */
export type SubjectCode = 'PHYSICS' | 'CHEMISTRY' | 'MATHEMATICS';

const PHYSICS: Record<string, string[]> = {
  'units-and-measurements': ['!dimension', '!ml²t', '!ml2t', '!mlt', '!ml-1', '!m l t', '!significant figure', '!least count', '!vernier', '!screw gauge', '!percentage error', 'relative error', 'absolute error', '~si unit', '~measured', '~error in'],
  kinematics: ['!projectile', '!relative velocity', '!time of flight', 'maximum height', 'trajectory', 'river', 'swimmer', 'boat', 'rain', 'retard', 'decelerat', 'uniformly accelerated', 'velocity-time', '~displacement', '~accelerat', '~velocity', '~speed', '~horizontal range'],
  'laws-of-motion': ['!friction', '!pulley', '!inclined plane', 'tension', "newton's law", 'impulse', 'banking', 'pseudo force', 'centripetal', '~block', '~string', '~momentum', '~lift', '~elevator', '~spring balance'],
  'work-energy-and-power': ['!collision', '!coefficient of restitution', '!work done by', '!work-energy', 'kinetic energy', 'potential energy', 'conservative force', 'elastic', 'inelastic', '~power', '~energy'],
  'rotational-motion': ['!moment of inertia', '!torque', '!angular momentum', '!radius of gyration', '!centre of mass', '!center of mass', '!rolling', '!rolls', 'rigid body', 'angular acceleration', '~disc', '~ring', '~axis', '~rotat'],
  gravitation: ['!gravitation', '!satellite', '!escape velocity', '!kepler', '!geostationary', 'orbit', 'planet', 'acceleration due to gravity', '~earth'],
  'properties-of-solids-and-liquids': ["!young's modulus", '!young modulus', '!bulk modulus', '!viscosity', '!viscous', '!surface tension', '!capillary', '!bernoulli', '!terminal velocity', '!thermal conductivity', '!calorimet', '!latent heat', '!specific heat', '!thermal expansion', "!stefan", "!newton's law of cooling", '!buoyan', 'shear', 'stress', 'strain', 'fluid', 'liquid', 'contact angle', 'streamline', 'linear expansion', 'conduction', 'wien', '~pressure', '~density', '~drop', '~bubble'],
  thermodynamics: ['!adiabatic', '!isothermal', '!isobaric', '!isochoric', '!carnot', '!heat engine', '!refrigerator', '!first law of thermodynamics', '!thermodynamic', 'entropy', 'internal energy', 'cyclic process', 'p-v', '~efficiency', '~work done by the gas', '~heat supplied'],
  'kinetic-theory-of-gases': ['!kinetic theory', '!rms speed', '!root mean square', '!mean free path', '!degrees of freedom', '!equipartition', 'most probable speed', 'ideal gas', 'gas molecule', 'monatomic', 'diatomic', '~average kinetic energy', '~molecules'],
  'oscillations-and-waves': ['!simple harmonic', '!=shm', '!pendulum', '!doppler', '!beats', '!organ pipe', '!standing wave', '!stationary wave', '!sonometer', 'oscillat', 'wave', 'sound', 'closed pipe', 'open pipe', 'overtone', 'harmonic', 'transverse', 'longitudinal', '~amplitude', '~time period', '~frequency', '~resonance'],
  electrostatics: ['!capacitor', '!capacitance', '!dielectric', '!electrostatic', '!coulomb', '!electric dipole', '!gauss', '!equipotential', '!electric field', '!electric potential', 'point charge', 'permittivity', 'parallel plate', '~charge', '~dipole', '~flux'],
  'current-electricity': ['!kirchhoff', '!wheatstone', '!meter bridge', '!metre bridge', '!potentiometer', '!internal resistance', '!drift velocity', '!resistivity', 'resistance', 'resistor', 'ammeter', 'voltmeter', 'ohm', '=emf', 'battery', '~circuit', '~current', '~cell'],
  'magnetic-effects-of-current-and-magnetism': ['!biot', '!savart', "!ampere's", '!solenoid', '!toroid', '!lorentz', '!cyclotron', '!bar magnet', '!paramagnetic', '!diamagnetic', '!ferromagnetic', '!susceptibility', '!hysteresis', 'magnetic field', 'magnetic moment', 'magnetic force', 'magneti', 'galvanometer', 'current carrying', 'current loop'],
  'electromagnetic-induction-and-alternating-currents': ['!induced emf', '!lenz', '!faraday', '!self inductance', '!mutual inductance', '!inductance', '!inductor', '!eddy', '!alternating current', '!=lcr', '!impedance', '!reactance', '!power factor', '!transformer', '!wattless', '!magnetic flux', '!induced', '!flux linked', 'induction', 'rms value', 'resonant frequency', '~=ac'],
  'electromagnetic-waves': ['!electromagnetic wave', '!=em wave', '!displacement current', '!electromagnetic spectrum', '!poynting', 'microwave', 'radio wave', 'infrared', 'ultraviolet', 'gamma ray', '~x-ray'],
  optics: ['!lens', '!mirror', '!refractive index', '!refract', '!prism', '!focal length', '!total internal reflection', '!critical angle', '!microscope', '!telescope', '!double slit', '!=ydse', '!interference', '!diffraction', '!fringe', '!polari', '!brewster', '!malus', '!huygen', 'reflect', 'magnification', 'convex', 'concave', 'dispersion', 'slit', '~image'],
  'dual-nature-of-matter-and-radiation': ['!photoelectric', '!work function', '!threshold frequency', '!stopping potential', '!de broglie', '!de-broglie', '!matter wave', '!davisson', 'photon', 'photocell', '~wavelength'],
  'atoms-and-nuclei': ['!radioactiv', '!half-life', '!half life', '!binding energy', '!mass defect', '!fission', '!fusion', '!rutherford', '!balmer', '!lyman', '!paschen', '!bohr', 'nucleus', 'nuclei', 'nuclear', 'decay', 'hydrogen atom', 'isotope', 'excited state', 'ground state', 'mean life', 'alpha particle', '~activity'],
  'electronic-devices': ['!semiconductor', '!diode', '!p-n junction', '!pn junction', '!transistor', '!zener', '!logic gate', '!rectifier', '!forward bias', '!reverse bias', '!depletion', '!load resistance', '!(ge)', '!(si)', '!germanium', '!silicon diode', '!=nand', '!=nor', 'gate', 'doping', 'n-type', 'p-type', 'boolean', 'photodiode', 'solar cell', '=led'],
  'experimental-skills': ['!searle', '!post office box', '!experiment', '~observation', '~reading'],
};

const CHEMISTRY: Record<string, string[]> = {
  'some-basic-concepts-in-chemistry': ['!empirical formula', 'molecular formula', '!limiting reagent', '!stoichiometr', '!percentage composition', 'molar mass', '!avogadro', '=mole', '=moles', 'gram atom', 'law of definite', 'law of multiple', '~=amu', '~equivalent weight'],
  'atomic-structure': ['!quantum number', '!heisenberg', '!uncertainty principle', '!electronic configuration', '!rydberg', '!aufbau', "!hund", '!pauli', '!de broglie', '!azimuthal', 'orbital', 'bohr', 'radial node', 'angular node', 'node', 'spin', 'hydrogen spectrum', 'emission spectrum', 'shell', '~wavelength', '~photon'],
  'chemical-bonding-and-molecular-structure': ['!hybridi', '!bond order', '!molecular orbital', '!=vsepr', '!dipole moment', 'lone pair', '!bond angle', '!formal charge', '!fajan', '!lattice energy', 'shape of', 'sigma', 'pi bond', 'hydrogen bond', 'ionic bond', 'covalent', 'octet', '=sp3', '=sp2', '=sp3d', '=sp3d2', '=dsp2', 'tetrahedral', 'trigonal', 'linear', '~paramagnetic', '~diamagnetic', '~geometry'],
  'chemical-thermodynamics': ['!enthalpy', '!entropy', '!gibbs', '!spontaneous', "!hess", '!exothermic', '!endothermic', '!bomb calorimeter', '!heat of', 'internal energy', 'heat capacity', 'isothermal', 'adiabatic', 'combustion', '~work done', '~=∆h', '~=δh'],
  solutions: ['!molality', '!mole fraction', '!raoult', '!vapour pressure', '!vapor pressure', '!osmotic', '!colligative', "!van't hoff", "!van 't hoff", '!depression in freezing', '!elevation in boiling', '!elevation of boiling', 'freezing point', 'boiling point', "!henry's law", '!azeotrop', '!cryoscopic', '!ebullioscopic', 'molarity', 'ideal solution', 'solute', 'solvent'],
  equilibrium: ['!equilibrium constant', '!le chatelier', '!buffer', '!solubility product', '!=ksp', '!ionisation constant', '!ionization constant', '!common ion', '!degree of dissociation', '!=ph', '!=pka', '!=kp', '!=kc', 'hydrolysis', 'conjugate', 'equilibrium', '~acid', '~base'],
  'redox-reactions-and-electrochemistry': ['!oxidation number', '!oxidation state', '!redox', '!electrode potential', '!nernst', '!electrolysis', '!galvanic', '!electrochemical', '!molar conductivity', '!kohlrausch', '!salt bridge', '!disproportionation', '!conductance', 'faraday', 'cell potential', '!is passed for', '!deposited', '!cathode', '!anode', 'electrode', 'copper salt', 'silver salt', 'standard reduction', 'e°', '~emf'],
  'chemical-kinetics': ['!rate constant', '!rate of reaction', '!order of reaction', '!first order', '!zero order', '!second order', '!activation energy', '!arrhenius', '!rate law', '!molecularity', 'half-life', 'half life', '~catalyst', '~rate'],
  'classification-of-elements-and-periodicity-in-properties': ['!periodic table', '!ionisation enthalpy', '!ionization enthalpy', '!ionization energy', '!electron gain enthalpy', '!electronegativity', '!atomic radi', '!ionic radi', '!periodicity', '!isoelectronic', 'atomic number', 'metallic character', '~group', '~period'],
  'p-block-elements': ['!diborane', '!borax', '!interhalogen', '!noble gas', '!xenon', '!=xef', '!oxoacid', '!ozone', '!group 13', '!group 14', '!group 15', '!group 16', '!group 17', '!group 18', 'boron', 'aluminium', 'silicon', 'phosphorus', 'sulphur', 'sulfur', 'halogen', 'chlorine', 'fluorine', 'ammonia', '=hno3', '=h2so4', '=pcl5', '=nh3', '~nitrogen', '~oxygen'],
  'd-and-f-block-elements': ['!transition metal', '!transition element', '!lanthan', '!actin', 'permanganate', 'dichromate', '=kmno4', '=k2cr2o7', '!d-block', '!f-block', '!inner transition', '3d series', '~magnetic moment'],
  'co-ordination-compounds': ['!coordination compound', '!coordination entity', '!coordination sphere', '!co-ordination compound', 'coordination', 'co-ordination', '!c2o4', '!oxalato', '!=edta', '!ligand', '!crystal field', '!=cfse', '!werner', '!chelat', '!spectrochemical', '!denticity', '!ambidentate', '!effective atomic number', 'complex', 'octahedral', 'square planar', '[co(', '[fe(', '[ni(', '[cu(', '[pt(', '[cr(', '[mn(', '~tetrahedral'],
  'purification-and-characterisation-of-organic-compounds': ['!chromatograph', '!distillation', '!crystallisation', '!crystallization', '!sublimation', '!lassaigne', '!kjeldahl', '!dumas', '!carius', 'estimation of', 'percentage of nitrogen', 'percentage of sulphur', 'percentage of halogen'],
  'some-basic-principles-of-organic-chemistry': ['!=iupac', '!degree of unsaturation', '!double bond equivalent', '!double-bond equivalent', '!inductive', '!hyperconjugation', '!carbocation', '!carbanion', '!free radical', '!nucleophile', '!electrophile', '!homolytic', '!heterolytic', '!electromeric', '!mesomeric', '!chiral', '!enantiomer', '!optical isomer', '!geometrical isomer', 'resonance', 'isomer', 'functional group', 'conformation', '~stability'],
  hydrocarbons: ['!alkane', '!alkene', '!alkyne', '!markovnikov', '!ozonolysis', '!wurtz', '!friedel', '!huckel', '!hückel', 'benzene', 'aromatic', 'hydrogenation', 'newman', 'acetylene', 'ethyne', 'propene', 'toluene', 'nitration', 'electrophilic substitution'],
  'organic-compounds-containing-halogens': ['!haloalkane', '!haloarene', '!alkyl halide', '!aryl halide', '!=sn1', '!=sn2', '!chloroform', '!finkelstein', '!swarts', '!dehydrohalogenation', '!saytzeff', '!zaitsev', 'chlorobenzene', 'freon', '=ddt', '~bromo', '~chloro'],
  'organic-compounds-containing-oxygen': ['!aldol', '!cannizzaro', '!reimer', '!tiemann', '!williamson', '!clemmensen', '!kishner', '!tollen', '!fehling', '!haloform', '!iodoform', '!=hvz', '!hell-volhard', '!lucas', '!esterification', 'alcohol', 'phenol', 'ether', 'aldehyde', 'ketone', 'carboxylic', 'ester', 'acetone', 'formaldehyde', 'benzaldehyde', 'acetic acid', '=pcc', '~grignard'],
  'organic-compounds-containing-nitrogen': ['!amine', '!aniline', '!diazonium', '!hofmann', '!gabriel', '!carbylamine', '!hinsberg', '!sandmeyer', '!azo dye', 'amide', 'nitro', 'nitrile', 'isocyanide', 'cyanide', 'coupling reaction'],
  biomolecules: ['!glucose', '!fructose', '!sucrose', '!maltose', '!lactose', '!starch', '!cellulose', '!carbohydrate', '!protein', '!amino acid', '!peptide', '!enzyme', '!vitamin', '!nucleic acid', '!=dna', '!=rna', '!nucleotide', '!glycosidic', '!zwitterion', '!saccharide', '!anomer', 'hormone', 'denaturation'],
  'principles-related-to-practical-chemistry': ['!salt analysis', '!titration', '!phenolphthalein', '!methyl orange', "!mohr's salt", '!confirmatory test', '!group reagent', '!flame test', '!borax bead', '!brown ring', 'indicator', 'oxalic acid', 'qualitative analysis', '~cation', '~anion', '~precipitate'],
};

const MATHEMATICS: Record<string, string[]> = {
  'sets-relations-and-functions': ['!reflexive', '!symmetric relation', '!transitive', '!equivalence relation', '!one-one', '!injective', '!surjective', '!bijective', '!power set', '!onto', 'relation', 'subset', 'union', 'intersection', 'domain', 'inverse function', 'composition', '~function', '~=set'],
  'complex-numbers-and-quadratic-equations': ['!complex number', '!argand', '!quadratic', '!discriminant', '!cube roots of unity', '!=iota', 'conjugate', 'argument', 'modulus', '|z', 'real roots', 'imaginary', 'roots of the equation', 'sum of roots', '~omega', '~ω', '~roots'],
  'matrices-and-determinants': ['!matrix', '!matrices', '!determinant', '!transpose', '!=adj', '!cramer', '!skew', '!system of linear equations', 'singular', 'trace', '=det', 'consistent', '~infinitely many solutions'],
  'permutations-and-combinations': ['!permutation', '!number of ways', '!letters of the word', '!arrange', '!committee', 'combination', 'arrangement', 'ways', 'selected', 'digits', 'factorial', '~distinct'],
  'binomial-theorem-and-its-simple-applications': ['!binomial', '!term independent', '!middle term', '!general term', '!expansion', 'coefficient of x', '~remainder when'],
  'sequence-and-series': ['!arithmetic progression', '!geometric progression', '!harmonic progression', '!common difference', '!common ratio', '!=a.p', '!=g.p', '!=h.p', 'series', 'sequence', 'sum of first', 'sum of n terms', 'infinite series', 'terms of', '~=a.m', '~=g.m'],
  'limit-continuity-and-differentiability': ['!=lim', '!limit', '!continuous', '!continuity', '!differentiable', '!rolle', '!mean value theorem', '!maxima', '!minima', '!increasing', '!decreasing', 'derivative', 'dy/dx', 'maximum value', 'minimum value', 'local maximum', 'local minimum', 'rate of change', 'normal to the curve', '~tangent'],
  'integral-calculus': ['!integral', '!∫', '!\\int', '!integrate', '!area bounded', '!area of the region', '!area enclosed', '!region enclosed', '!area of the region', '!area (in square units)', '!definite integral', '!bounded by', 'region', '!antiderivative', '=dx'],
  'differential-equations': ['!differential equation', '!integrating factor', '!order and degree', '!solution curve', 'general solution of', 'satisfies the differential', '~y(0)'],
  'co-ordinate-geometry': ['!parabol', '!llips', '!hyperbol', '!eccentricity', '!latus rectum', '!directrix', '!circle', '!straight line', '!orthocent', '!circumcent', '!incent', '!centroid', '!locus', 'slope', 'chord', 'focus', 'foci', 'intercept', 'vertices', 'x-axis', 'y-axis', 'coordinates', '~tangent to the', '~normal to the'],
  'three-dimensional-geometry': ['!direction cosine', '!direction ratio', '!skew lines', '!shortest distance', '=plane', 'planes', 'z-axis', 'angle between the line and the plane', 'foot of the perpendicular', '~image of the point', '~line'],
  'vector-algebra': ['!vector', '!scalar triple', '!cross product', '!dot product', '!unit vector', '!coplanar', 'projection', 'collinear', 'î', 'ĵ', 'k̂', '~magnitude'],
  'statistics-and-probability': ['!probability', '!variance', '!standard deviation', '!median', '!random variable', '!bayes', '!mean deviation', '!independent events', '!conditional probability', 'dice', '=die', 'coin', 'cards', 'drawn', 'mean', 'mode', 'observations', 'expected value'],
  trigonometry: ['!trigonometric', '!angle of elevation', '!angle of depression', '!principal value', '!height and distance', '!sine rule', '!=cosec', '!tan⁻¹', '!sin⁻¹', '!cos⁻¹', 'triangle abc', '=sin', '=cos', '=tan', '=cot', '=sec', '~general solution'],
};

const TABLE: Record<SubjectCode, Record<string, string[]>> = { PHYSICS, CHEMISTRY, MATHEMATICS };

type Term = { re: RegExp | null; text: string; weight: number };
const compiled = new Map<SubjectCode, [string, Term[]][]>();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(subject: SubjectCode): [string, Term[]][] {
  let c = compiled.get(subject);
  if (c) return c;
  c = Object.entries(TABLE[subject]).map(([chapter, terms]) => [
    chapter,
    terms.map((raw) => {
      const weight = raw.startsWith('!') ? 4 : raw.startsWith('~') ? 1 : 2;
      let t = raw.replace(/^[!~]/, '');
      const whole = t.startsWith('=') || t.length <= 3;
      t = t.replace(/^=/, '').toLowerCase();
      // Whole-word match; a number or ^ may follow a function name (sin2x, cos^2).
      return { text: t, weight, re: whole ? new RegExp(`(?<![a-z])${escapeRe(t)}(?![a-z])`, 'i') : null };
    }),
  ]);
  compiled.set(subject, c);
  return c;
}

export type ChapterGuess = {
  /** Chapter suffix (e.g. "current-electricity"); null when nothing matched. */
  chapter: string | null;
  score: number;
  runnerUp: string | null;
  runnerUpScore: number;
  confident: boolean;
  /** The terms that matched for the winner (explainability for reviewers). */
  matched: string[];
};

/** Minimum winning score, and how far ahead of the runner-up it must be, for an automatic assignment. */
export const CONFIDENCE = { minScore: 4, minLead: 3, minRatio: 2 } as const;

export function classifyChapter(subject: SubjectCode, rawText: string): ChapterGuess {
  const text = ` ${rawText.toLowerCase().replace(/\s+/g, ' ')} `;
  const scored = compile(subject)
    .map(([chapter, terms]) => {
      const matched = terms.filter((t) => (t.re ? t.re.test(text) : text.includes(t.text)));
      return { chapter, score: matched.reduce((n, t) => n + t.weight, 0), matched: matched.map((t) => t.text) };
    })
    .sort((a, b) => b.score - a.score);
  const [top, second] = scored;
  if (!top || top.score === 0) return { chapter: null, score: 0, runnerUp: null, runnerUpScore: 0, confident: false, matched: [] };
  const s2 = second?.score ?? 0;
  const confident = top.score >= CONFIDENCE.minScore && top.score - s2 >= CONFIDENCE.minLead && top.score >= CONFIDENCE.minRatio * s2;
  return { chapter: top.chapter, score: top.score, runnerUp: second?.chapter ?? null, runnerUpScore: s2, confident, matched: top.matched };
}

/** Every chapter suffix the classifier knows, per subject (tests check these exist in the taxonomy). */
export function knownChapters(subject: SubjectCode): string[] {
  return Object.keys(TABLE[subject]);
}
