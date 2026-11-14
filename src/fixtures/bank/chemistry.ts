import { fmt, mapping, statements, type Template } from "./engine";

const C = { subject: "chemistry" as const, exams: ["jee-main", "jee-advanced", "neet"] as ("jee-main" | "jee-advanced" | "neet")[] };

export const chemistryTemplates: Template[] = [
  {
    ...C, key: "ch_molar", chapter: "some-basic-concepts-in-chemistry", topic: "concentration-terms", difficulty: "easy",
    make: (r) => {
      const [name, M] = r.pick([["NaOH", 40], ["NaCl", 58.5], ["glucose", 180], ["urea", 60]] as [string, number][]);
      const n = r.pick([0.1, 0.2, 0.25, 0.5]);
      const V = r.pick([250, 500]);
      const w = n * M;
      const molarity = n / (V / 1000);
      return {
        kind: "value", unit: "M",
        stem: `$${fmt(w)}\\,\\text{g}$ of ${name} (molar mass $${M}\\,\\text{g mol}^{-1}$) is dissolved in water to make $${V}\\,\\text{mL}$ of solution. The molarity of the solution is`,
        value: molarity, wrong: [n, molarity / 2, molarity * 2],
        hint: "Molarity is moles of solute per litre of solution — convert both quantities first.",
        steps: [
          { body: `Moles $= \\dfrac{${fmt(w)}}{${M}} = ${n}\\,\\text{mol}$.` },
          { body: `$M = \\dfrac{${n}}{${V / 1000}\\,\\text{L}} = ${fmt(molarity)}\\,\\text{M}$.` },
        ],
      };
    },
  },
  {
    ...C, key: "ch_nodes", chapter: "atomic-structure", topic: "quantum-numbers", difficulty: "easy",
    make: (r) => {
      const [label, n, l] = r.pick([["3p", 3, 1], ["4d", 4, 2], ["5s", 5, 0], ["4p", 4, 1], ["5d", 5, 2], ["4f", 4, 3], ["6s", 6, 0]] as [string, number, number][]);
      const radial = n - l - 1;
      return {
        kind: "value",
        stem: `The number of radial nodes in a ${label} orbital is`,
        value: radial, wrong: [n - 1, l, n - l, radial + 1, radial + 2],
        hint: "Total nodes are $n - 1$; angular nodes equal $l$; the rest are radial.",
        steps: [
          { body: `For ${label}: $n = ${n}$, $l = ${l}$.` },
          { body: `Radial nodes $= n - l - 1 = ${radial}$ (angular nodes $= l = ${l}$).` },
        ],
      };
    },
  },
  mapping(
    { ...C, key: "ch_vsepr", chapter: "chemical-bonding-and-molecular-structure", topic: "vsepr-theory", difficulty: "medium" },
    [
      ["$\\text{NH}_3$", "Trigonal pyramidal", "3 bond pairs + 1 lone pair on N (sp³) → trigonal pyramidal."],
      ["$\\text{BF}_3$", "Trigonal planar", "3 bond pairs, no lone pair on B (sp²) → trigonal planar."],
      ["$\\text{PCl}_5$", "Trigonal bipyramidal", "5 bond pairs on P (sp³d) → trigonal bipyramidal."],
      ["$\\text{SF}_6$", "Octahedral", "6 bond pairs on S (sp³d²) → octahedral."],
      ["$\\text{XeF}_4$", "Square planar", "4 bond pairs + 2 lone pairs on Xe (sp³d²) → square planar."],
      ["$\\text{ClF}_3$", "T-shaped", "3 bond pairs + 2 lone pairs on Cl (sp³d) → T-shaped."],
      ["$\\text{XeF}_2$", "Linear", "2 bond pairs + 3 lone pairs on Xe (sp³d), lone pairs equatorial → linear."],
      ["$\\text{SF}_4$", "See-saw", "4 bond pairs + 1 lone pair on S (sp³d) → see-saw."],
      ["$\\text{H}_2\\text{O}$", "Bent", "2 bond pairs + 2 lone pairs on O (sp³) → bent."],
    ],
    (m) => `According to VSEPR theory, the shape of ${m} is`,
    "Count bond pairs and lone pairs on the central atom, then place the lone pairs where repulsion is least.",
  ),
  mapping(
    { ...C, key: "ch_bo", chapter: "chemical-bonding-and-molecular-structure", topic: "molecular-orbital-theory", difficulty: "medium" },
    [
      ["$\\text{O}_2^{+}$", "$2.5$", "15 electrons: bond order $= (10 - 5)/2 = 2.5$."],
      ["$\\text{O}_2^{-}$", "$1.5$", "17 electrons: bond order $= (10 - 7)/2 = 1.5$."],
      ["$\\text{O}_2^{2-}$", "$1$", "18 electrons: bond order $= (10 - 8)/2 = 1$."],
      ["$\\text{N}_2$", "$3$", "14 electrons: bond order $= (10 - 4)/2 = 3$."],
      ["$\\text{He}_2^{+}$", "$0.5$", "3 electrons: bond order $= (2 - 1)/2 = 0.5$."],
      ["$\\text{O}_2$", "$2$", "16 electrons: bond order $= (10 - 6)/2 = 2$."],
    ],
    (m) => `According to molecular orbital theory, the bond order of ${m} is`,
    "Fill the molecular orbitals in order, then halve the difference between bonding and antibonding electrons.",
  ),
  {
    ...C, key: "ch_gibbs", chapter: "chemical-thermodynamics", topic: "gibbs-energy", difficulty: "medium",
    make: (r) => {
      const dH = r.pick([-40, -20, 30, 50, 90]);
      const dS = r.pick([100, 150, 200]);
      const T = r.pick([300, 400, 500]);
      const dG = dH - (T * dS) / 1000;
      return {
        kind: "value", unit: "kJ mol^{-1}",
        stem: `For a reaction, $\\Delta H = ${dH}\\,\\text{kJ mol}^{-1}$ and $\\Delta S = ${dS}\\,\\text{J K}^{-1}\\text{mol}^{-1}$. At $${T}\\,\\text{K}$, $\\Delta G$ in $\\text{kJ mol}^{-1}$ is`,
        value: dG, wrong: [dH + (T * dS) / 1000, dH - T * dS, -dG],
        hint: "Watch the units: $\\Delta S$ is in joules, $\\Delta H$ is in kilojoules.",
        steps: [
          { body: "$\\Delta G = \\Delta H - T\\Delta S$." },
          { body: `$\\Delta G = ${dH} - ${T}(${dS / 1000}) = ${fmt(dG)}\\,\\text{kJ mol}^{-1}$.` },
        ],
      };
    },
  },
  mapping(
    { ...C, key: "ch_vant", chapter: "solutions", topic: "colligative-properties", difficulty: "easy" },
    [
      ["$\\text{NaCl}$", "$2$", "$\\text{NaCl} \\to \\text{Na}^+ + \\text{Cl}^-$: 2 ions."],
      ["$\\text{CaCl}_2$", "$3$", "$\\text{CaCl}_2 \\to \\text{Ca}^{2+} + 2\\text{Cl}^-$: 3 ions."],
      ["$\\text{K}_4[\\text{Fe(CN)}_6]$", "$5$", "$4\\text{K}^+ + [\\text{Fe(CN)}_6]^{4-}$: 5 ions."],
      ["glucose", "$1$", "Glucose does not dissociate in water."],
      ["$\\text{K}_3[\\text{Fe(CN)}_6]$", "$4$", "$3\\text{K}^+ + [\\text{Fe(CN)}_6]^{3-}$: 4 ions."],
    ],
    (s) => `Assuming complete dissociation, the van 't Hoff factor $i$ for an aqueous solution of ${s} is`,
    "Count the ions released per formula unit.",
  ),
  {
    ...C, key: "ch_ph", chapter: "equilibrium", topic: "ph-and-buffers", difficulty: "easy",
    make: (r) => {
      const n = r.int(1, 4);
      const base = r.next() < 0.5;
      const pH = base ? 14 - n : n;
      return {
        kind: "value",
        stem: `The pH of a $10^{-${n}}\\,\\text{M}$ aqueous solution of ${base ? "$\\text{NaOH}$" : "$\\text{HCl}$"} at $25^\\circ\\text{C}$ is`,
        value: pH, wrong: [base ? n : 14 - n, pH + 1, pH - 1],
        hint: base ? "Find pOH from the hydroxide concentration first." : "A strong acid dissociates completely.",
        steps: base
          ? [{ body: `$[\\text{OH}^-] = 10^{-${n}}$, so $\\text{pOH} = ${n}$.` }, { body: `$\\text{pH} = 14 - ${n} = ${pH}$.` }]
          : [{ body: `$[\\text{H}^+] = 10^{-${n}}$, so $\\text{pH} = ${n}$.` }],
      };
    },
  },
  mapping(
    { ...C, key: "ch_ox", chapter: "redox-reactions-and-electrochemistry", topic: "balancing-redox", difficulty: "easy" },
    [
      ["Cr in $\\text{K}_2\\text{Cr}_2\\text{O}_7$", "$+6$", "$2(+1) + 2x + 7(-2) = 0 \\Rightarrow x = +6$."],
      ["Mn in $\\text{KMnO}_4$", "$+7$", "$+1 + x + 4(-2) = 0 \\Rightarrow x = +7$."],
      ["N in $\\text{HNO}_3$", "$+5$", "$+1 + x + 3(-2) = 0 \\Rightarrow x = +5$."],
      ["Fe in $\\text{K}_4[\\text{Fe(CN)}_6]$", "$+2$", "$4(+1) + x + 6(-1) = 0 \\Rightarrow x = +2$."],
      ["P in $\\text{H}_3\\text{PO}_3$", "$+3$", "$3(+1) + x + 3(-2) = 0 \\Rightarrow x = +3$."],
      ["Cl in $\\text{HOCl}$", "$+1$", "$+1 + (-2) + x = 0 \\Rightarrow x = +1$."],
      ["N in $\\text{NH}_3$", "$-3$", "$x + 3(+1) = 0 \\Rightarrow x = -3$."],
    ],
    (s) => `The oxidation state of ${s} is`,
    "Sum of oxidation states equals the overall charge; O is usually −2, alkali metals +1.",
  ),
  {
    ...C, key: "ch_faraday", chapter: "redox-reactions-and-electrochemistry", topic: "nernst-equation", difficulty: "medium",
    make: (r) => {
      const [metal, M, z] = r.pick([["silver", 108, 1], ["copper", 63.5, 2], ["silver", 108, 1]] as [string, number, number][]);
      const [I, t] = r.pick([[9.65, 1000], [1.93, 5000], [19.3, 500], [4.825, 2000]]);
      const Q = I * t;
      const mass = (Q / 96500) * (M / z);
      return {
        kind: "value", unit: "g", tolerance: 0.01,
        stem: `A current of $${I}\\,\\text{A}$ is passed for $${t}\\,\\text{s}$ through a solution of a ${metal} salt (${metal} ion charge $+${z}$, molar mass $${M}\\,\\text{g mol}^{-1}$). Taking $F = 96500\\,\\text{C mol}^{-1}$, the mass of ${metal} deposited, in grams, is`,
        value: Number(mass.toFixed(2)), wrong: [Number((mass * 2).toFixed(2)), Number((mass / 2).toFixed(2)), Number(((Q / 96500) * M * z).toFixed(2))],
        hint: "Charge passed → moles of electrons → moles of metal (divide by the ion's charge).",
        steps: [
          { body: `$Q = It = ${fmt(Q)}\\,\\text{C} = ${fmt(Q / 96500, 4)}\\,F$.` },
          { body: `Moles of metal $= ${fmt(Q / 96500, 4)}/${z}$; mass $= ${fmt(Q / 96500 / z, 4)} \\times ${M} = ${fmt(mass, 2)}\\,\\text{g}$.` },
        ],
      };
    },
  },
  {
    ...C, key: "ch_rate", chapter: "chemical-kinetics", topic: "rate-law", difficulty: "medium",
    make: (r) => {
      const m = r.int(1, 2);
      const n = r.int(0, 2);
      const a = r.pick([2, 3]);
      const b = r.pick([2, 3]);
      const f = a ** m * b ** n;
      return {
        kind: "value",
        stem: `The rate law for a reaction is $\\text{rate} = k[\\text{A}]^{${m}}[\\text{B}]^{${n}}$. If $[\\text{A}]$ is made ${a} times and $[\\text{B}]$ is made ${b} times, the rate increases by a factor of`,
        value: f, wrong: [a * m + b * n, a * b, a ** n * b ** m === f ? f + a : a ** n * b ** m],
        hint: "Raise each concentration factor to its order, then multiply.",
        steps: [{ body: `Factor $= ${a}^{${m}} \\times ${b}^{${n}} = ${f}$.` }],
      };
    },
  },
  {
    ...C, key: "ch_half", chapter: "chemical-kinetics", topic: "integrated-rate-equations", difficulty: "easy", forms: ["single"],
    make: (r) => {
      const t = r.pick([10, 20, 30, 69.3]);
      const k = 0.693 / t;
      return {
        kind: "value", unit: "min^{-1}",
        stem: `A first-order reaction has a half-life of $${t}\\,\\text{min}$. Its rate constant is`,
        value: Number(k.toFixed(4)), wrong: [Number((t / 0.693).toFixed(2)), Number((1 / t).toFixed(4)), Number((0.693 * t).toFixed(2))],
        hint: "For first order, half-life is independent of concentration.",
        steps: [{ body: "$k = \\dfrac{0.693}{t_{1/2}}$." }, { body: `$k = \\dfrac{0.693}{${t}} = ${fmt(k, 4)}\\,\\text{min}^{-1}$.` }],
      };
    },
  },
  mapping(
    { ...C, key: "ch_period", chapter: "classification-of-elements-and-periodicity", topic: "ionisation-enthalpy", difficulty: "medium" },
    [
      ["first ionisation enthalpy", "$\\text{B} < \\text{C} < \\text{O} < \\text{N}$", "Ionisation enthalpy rises across period 2, but N > O because N's half-filled 2p is extra stable."],
      ["atomic radius", "$\\text{F} < \\text{O} < \\text{N} < \\text{C}$", "Atomic radius decreases across a period as effective nuclear charge rises."],
      ["electronegativity", "$\\text{C} < \\text{N} < \\text{O} < \\text{F}$", "Electronegativity increases across a period; F is the most electronegative element."],
      ["electron gain enthalpy (most negative last)", "$\\text{O} < \\text{S} < \\text{F} < \\text{Cl}$", "Cl has the most negative electron gain enthalpy; F and O are less negative than Cl and S because of their small, crowded valence shells."],
    ],
    (p) => `The correct order of ${p} is`,
    "Start from the general periodic trend, then look for exceptions caused by half-filled or small, crowded shells.",
  ),
  mapping(
    { ...C, key: "ch_mu", chapter: "coordination-compounds", topic: "crystal-field-theory", difficulty: "medium" },
    [
      ["$\\text{Fe}^{3+}$ (high spin)", "$5.92\\,\\text{BM}$", "$3d^5$, 5 unpaired: $\\sqrt{5 \\times 7} = 5.92$."],
      ["$\\text{Cr}^{3+}$", "$3.87\\,\\text{BM}$", "$3d^3$, 3 unpaired: $\\sqrt{3 \\times 5} = 3.87$."],
      ["$\\text{Ni}^{2+}$", "$2.83\\,\\text{BM}$", "$3d^8$, 2 unpaired: $\\sqrt{2 \\times 4} = 2.83$."],
      ["$\\text{Cu}^{2+}$", "$1.73\\,\\text{BM}$", "$3d^9$, 1 unpaired: $\\sqrt{1 \\times 3} = 1.73$."],
      ["$\\text{Fe}^{2+}$ (high spin)", "$4.90\\,\\text{BM}$", "$3d^6$, 4 unpaired: $\\sqrt{4 \\times 6} = 4.90$."],
      ["$\\text{Zn}^{2+}$", "$0\\,\\text{BM}$", "$3d^{10}$: no unpaired electrons."],
    ],
    (ion) => `The spin-only magnetic moment of ${ion} is`,
    "Count unpaired d-electrons $n$, then use $\\mu = \\sqrt{n(n+2)}$.",
  ),
  {
    ...C, key: "ch_dbe", chapter: "some-basic-principles-of-organic-chemistry", topic: "iupac-nomenclature", difficulty: "medium",
    make: (r) => {
      const [f, c, h, n, x] = r.pick([
        ["C_6H_6", 6, 6, 0, 0], ["C_4H_6", 4, 6, 0, 0], ["C_5H_5N", 5, 5, 1, 0], ["C_7H_7Cl", 7, 7, 0, 1], ["C_8H_8", 8, 8, 0, 0], ["C_6H_{10}", 6, 10, 0, 0], ["C_{10}H_8", 10, 8, 0, 0],
      ] as [string, number, number, number, number][]);
      const dbe = c - (h + x) / 2 + n / 2 + 1;
      return {
        kind: "value",
        stem: `The degree of unsaturation (double-bond equivalent) of a compound with molecular formula $\\text{${f.replace(/_(\{?\d+\}?)/g, "}_$1\\text{")}}$ is`,
        value: dbe, wrong: [dbe + 1, dbe - 1, c / 2],
        hint: "Each ring or π bond removes two hydrogens from the saturated formula.",
        steps: [
          { body: "$\\text{DBE} = C - \\dfrac{H + X}{2} + \\dfrac{N}{2} + 1$." },
          { body: `$= ${c} - \\dfrac{${h} + ${x}}{2} + \\dfrac{${n}}{2} + 1 = ${dbe}$.` },
        ],
      };
    },
  },
  {
    ...C, key: "ch_iso", chapter: "hydrocarbons", topic: "alkenes", difficulty: "easy", forms: ["single", "numerical"],
    make: (r) => {
      const [f, k] = r.pick([["C_4H_{10}", 2], ["C_5H_{12}", 3], ["C_6H_{14}", 5], ["C_7H_{16}", 9]] as [string, number][]);
      return {
        kind: "value",
        stem: `The number of structural isomers possible for the alkane $\\text{${f.replace(/_(\{?\d+\}?)/g, "}_$1\\text{")}}$ is`,
        value: k, wrong: [k + 1, k + 2, Math.max(1, k - 1)],
        hint: "Draw the longest chain first, then shorten it by one carbon at a time and place branches.",
        steps: [{ body: `Systematically shortening the main chain and placing methyl/ethyl branches gives ${k} distinct isomers.` }],
      };
    },
  },
  mapping(
    { ...C, key: "ch_bio", chapter: "biomolecules", topic: "carbohydrates", difficulty: "easy" },
    [
      ["Sucrose", "Glucose and fructose", "Sucrose is a non-reducing disaccharide of α-D-glucose and β-D-fructose."],
      ["Maltose", "Two glucose units", "Maltose = two α-D-glucose units joined by an α-1,4 link."],
      ["Lactose", "Glucose and galactose", "Lactose = β-D-galactose + β-D-glucose."],
      ["Cellulose", "β-D-glucose units only", "Cellulose is a linear polymer of β-D-glucose."],
    ],
    (s) => `On hydrolysis, ${s.toLowerCase()} gives`,
    "Recall which monosaccharides make up each disaccharide or polysaccharide.",
  ),
  statements(
    { ...C, key: "ch_ms_sn", chapter: "organic-compounds-containing-halogens", topic: "sn1-and-sn2", difficulty: "hard" },
    "Which of the following statements about nucleophilic substitution in alkyl halides are correct?",
    [
      ["SN2 reactions proceed with inversion of configuration.", "backside attack flips the stereocentre (Walden inversion)."],
      ["Tertiary alkyl halides favour SN1.", "they form the most stable carbocations and are too hindered for SN2."],
      ["SN1 reactions are favoured by polar protic solvents.", "they stabilise the carbocation and the leaving group."],
      ["The rate of an SN2 reaction depends on both substrate and nucleophile.", "it is a single bimolecular step."],
    ],
    [
      ["SN1 reactions show second-order kinetics.", "the rate-determining step involves only the substrate."],
      ["Methyl halides react fastest by SN1.", "the methyl cation is very unstable; methyl halides react by SN2."],
      ["SN2 reactions go through a carbocation intermediate.", "SN2 is concerted, with a single transition state."],
    ],
  ),
  statements(
    { ...C, key: "ch_ms_tm", chapter: "d-and-f-block-elements", topic: "transition-metal-properties", difficulty: "hard" },
    "Which of the following statements about transition elements are correct?",
    [
      ["They show variable oxidation states.", "the (n−1)d and ns energies are close."],
      ["Many of their compounds are coloured.", "d–d transitions absorb visible light."],
      ["Many of them and their compounds act as catalysts.", "variable oxidation states and surface adsorption help."],
      ["They form complexes readily.", "small, highly charged ions with vacant d orbitals."],
    ],
    [
      ["All their compounds are diamagnetic.", "many have unpaired d electrons and are paramagnetic."],
      ["Zinc shows typical variable valency.", "Zn shows only +2."],
      ["Their atomic radii increase sharply across a series.", "radii stay nearly constant across a series."],
    ],
  ),
];
