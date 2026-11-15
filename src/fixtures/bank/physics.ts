import { fmt, frac, mapping, statements, type Template } from "./engine";

const ALL = ["jee-main", "jee-advanced", "neet"] as const;
const P = { subject: "physics" as const, exams: [...ALL] };
const G = "Take $g = 10\\,\\text{m s}^{-2}$.";

export const physicsTemplates: Template[] = [
  {
    ...P, key: "ph_err", chapter: "units-and-measurements", topic: "errors-in-measurement", difficulty: "easy",
    make: (r) => {
      const [p, q, s] = [r.int(1, 3), r.int(1, 2), r.int(1, 2)];
      const [ea, eb, ec] = [r.int(1, 3), r.int(1, 4), r.int(1, 3)];
      const v = p * ea + q * eb + s * ec;
      return {
        kind: "value", unit: "\\%",
        stem: `A quantity is calculated as $X = \\dfrac{a^{${p}}\\, b^{${q}}}{c^{${s}}}$. The percentage errors in $a$, $b$ and $c$ are $${ea}\\%$, $${eb}\\%$ and $${ec}\\%$. The maximum percentage error in $X$ is`,
        value: v, wrong: [Math.abs(p * ea + q * eb - s * ec) || v + 2, ea + eb + ec === v ? v + 1 : ea + eb + ec, v * 2],
        hint: "Relative errors add, each weighted by the power of its quantity, whether it multiplies or divides.",
        steps: [
          { body: `$\\dfrac{\\Delta X}{X} = ${p}\\dfrac{\\Delta a}{a} + ${q}\\dfrac{\\Delta b}{b} + ${s}\\dfrac{\\Delta c}{c}$` },
          { body: `$= ${p}(${ea}) + ${q}(${eb}) + ${s}(${ec}) = ${v}\\%$` },
        ],
      };
    },
  },
  mapping(
    { ...P, key: "ph_dim", chapter: "units-and-measurements", topic: "dimensional-analysis", difficulty: "easy" },
    [
      ["force", "$[\\text{MLT}^{-2}]$", "Force = mass × acceleration, so $[\\text{M}][\\text{LT}^{-2}]$."],
      ["energy", "$[\\text{ML}^2\\text{T}^{-2}]$", "Energy = force × distance: $[\\text{MLT}^{-2}][\\text{L}]$."],
      ["power", "$[\\text{ML}^2\\text{T}^{-3}]$", "Power = energy / time: $[\\text{ML}^2\\text{T}^{-2}]/[\\text{T}]$."],
      ["pressure", "$[\\text{ML}^{-1}\\text{T}^{-2}]$", "Pressure = force / area: $[\\text{MLT}^{-2}]/[\\text{L}^2]$."],
      ["linear momentum", "$[\\text{MLT}^{-1}]$", "Momentum = mass × velocity."],
      ["Planck's constant", "$[\\text{ML}^2\\text{T}^{-1}]$", "From $E = h\\nu$: $h = E/\\nu = [\\text{ML}^2\\text{T}^{-2}][\\text{T}]$."],
      ["the gravitational constant $G$", "$[\\text{M}^{-1}\\text{L}^3\\text{T}^{-2}]$", "From $F = Gm_1m_2/r^2$: $G = Fr^2/m^2$."],
      ["surface tension", "$[\\text{MT}^{-2}]$", "Surface tension = force / length: $[\\text{MLT}^{-2}]/[\\text{L}]$."],
      ["coefficient of viscosity", "$[\\text{ML}^{-1}\\text{T}^{-1}]$", "From $F = \\eta A\\,\\dfrac{dv}{dx}$: $\\eta = [\\text{MLT}^{-2}]/([\\text{L}^2][\\text{T}^{-1}])$."],
    ],
    (q) => `The dimensional formula of ${q} is`,
    "Write the quantity in terms of a defining equation, then substitute M, L and T.",
  ),
  {
    ...P, key: "ph_proj", chapter: "kinematics", topic: "projectile-motion", difficulty: "easy",
    make: (r) => {
      const u = r.pick([20, 40, 60]);
      const H = (u * u) / 80; // θ = 30°: H = u² sin²30 / 2g = u²/(8g)
      return {
        kind: "value", unit: "m",
        stem: `A ball is projected with a speed of $${u}\\,\\text{m s}^{-1}$ at $30^\\circ$ above the horizontal. ${G} The maximum height reached, in metres, is`,
        value: H, wrong: [2 * H, H / 2, 3 * H],
        hint: "Only the vertical component of velocity matters for the maximum height.",
        steps: [
          { body: `Vertical component: $u_y = u\\sin 30^\\circ = ${u / 2}\\,\\text{m s}^{-1}$.` },
          { body: `$H = \\dfrac{u_y^2}{2g} = \\dfrac{${(u / 2) ** 2}}{20} = ${fmt(H)}\\,\\text{m}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_brake", chapter: "kinematics", topic: "motion-in-a-straight-line", difficulty: "easy",
    make: (r) => {
      const v = r.pick([10, 20, 30]);
      const s = r.pick([10, 20, 25, 50]);
      const a = (v * v) / (2 * s);
      return {
        kind: "value", unit: "m s^{-2}",
        stem: `A car moving at $${v}\\,\\text{m s}^{-1}$ is brought to rest with uniform deceleration over a distance of $${s}\\,\\text{m}$. The magnitude of the deceleration, in $\\text{m s}^{-2}$, is`,
        value: a, wrong: [a * 2, v / s, a / 2],
        hint: "Use the equation that links velocities and displacement without time.",
        steps: [
          { body: "$v^2 = u^2 - 2as$ with final speed $0$." },
          { body: `$a = \\dfrac{u^2}{2s} = \\dfrac{${v * v}}{${2 * s}} = ${fmt(a)}\\,\\text{m s}^{-2}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_fric", chapter: "laws-of-motion", topic: "friction", difficulty: "medium",
    make: (r) => {
      const m = r.pick([2, 4, 5]);
      const mu = r.pick([0.2, 0.25, 0.5]);
      const a = r.int(1, 4);
      const F = m * (a + mu * 10);
      return {
        kind: "value", unit: "m s^{-2}",
        stem: `A block of mass $${m}\\,\\text{kg}$ on a rough horizontal floor ($\\mu_k = ${mu}$) is pulled by a horizontal force of $${fmt(F)}\\,\\text{N}$. ${G} The acceleration of the block, in $\\text{m s}^{-2}$, is`,
        value: a, wrong: [F / m, a + 1, Math.max(0.5, a - 1)],
        hint: "Subtract kinetic friction from the applied force before dividing by the mass.",
        steps: [
          { body: `Friction: $f = \\mu_k mg = ${mu} \\times ${m} \\times 10 = ${fmt(mu * m * 10)}\\,\\text{N}$.` },
          { body: `$a = \\dfrac{F - f}{m} = \\dfrac{${fmt(F)} - ${fmt(mu * m * 10)}}{${m}} = ${a}\\,\\text{m s}^{-2}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_atwood", chapter: "laws-of-motion", topic: "newtons-laws", difficulty: "medium", forms: ["single"],
    make: (r) => {
      const [m1, m2] = r.pick([[3, 1], [5, 3], [4, 1], [6, 2], [7, 3]]);
      const a = ((m1 - m2) * 10) / (m1 + m2);
      return {
        kind: "value", unit: "m s^{-2}",
        stem: `Two masses of $${m1}\\,\\text{kg}$ and $${m2}\\,\\text{kg}$ hang from a light string over a frictionless pulley. ${G} The acceleration of the system is`,
        value: a, wrong: [((m1 - m2) * 10) / m1, (m1 * 10) / (m1 + m2), 10],
        hint: "The net driving force is the difference in weights; the whole system accelerates together.",
        steps: [
          { body: "Net force on the system $= (m_1 - m_2)g$, total mass $= m_1 + m_2$." },
          { body: `$a = \\dfrac{(${m1} - ${m2})(10)}{${m1} + ${m2}} = ${fmt(a)}\\,\\text{m s}^{-2}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_drop", chapter: "work-energy-and-power", topic: "work-energy-theorem", difficulty: "easy",
    make: (r) => {
      const h = r.pick([5, 20, 45, 80, 125]);
      const v = Math.sqrt(20 * h);
      return {
        kind: "value", unit: "m s^{-1}",
        stem: `A stone is dropped from rest from a height of $${h}\\,\\text{m}$. Neglect air resistance. ${G} Its speed just before hitting the ground, in $\\text{m s}^{-1}$, is`,
        value: v, wrong: [v * 2, v / 2, h / 2],
        hint: "Equate the loss of potential energy to the gain in kinetic energy.",
        steps: [
          { body: "$mgh = \\tfrac12 mv^2 \\Rightarrow v = \\sqrt{2gh}$." },
          { body: `$v = \\sqrt{2 \\times 10 \\times ${h}} = ${v}\\,\\text{m s}^{-1}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_coll", chapter: "work-energy-and-power", topic: "collisions", difficulty: "medium", forms: ["single"],
    make: (r) => {
      const [m1, m2] = r.pick([[1, 1], [2, 1], [1, 3], [3, 1], [1, 2]]);
      const u = r.pick([6, 12]);
      const v2 = (2 * m1 * u) / (m1 + m2);
      return {
        kind: "value", unit: "m s^{-1}",
        stem: `A ball of mass $${m1}\\,\\text{kg}$ moving at $${u}\\,\\text{m s}^{-1}$ makes a head-on elastic collision with a stationary ball of mass $${m2}\\,\\text{kg}$. The speed of the second ball after the collision is`,
        value: v2, wrong: [(m1 * u) / (m1 + m2), u, v2 / 2 === (m1 * u) / (m1 + m2) ? v2 + 1 : v2 / 2],
        hint: "In a 1D elastic collision both momentum and kinetic energy are conserved.",
        steps: [
          { body: "For a stationary target: $v_2 = \\dfrac{2m_1}{m_1 + m_2}\\,u$." },
          { body: `$v_2 = \\dfrac{2(${m1})}{${m1 + m2}}(${u}) = ${fmt(v2)}\\,\\text{m s}^{-1}$.` },
        ],
      };
    },
  },
  mapping(
    { ...P, key: "ph_roll", chapter: "rotational-motion", topic: "rolling-motion", difficulty: "medium" },
    [
      ["a solid sphere", `$${frac(2, 7)}$`, "$K_{rot}/K_{tot} = \\dfrac{k^2/R^2}{1 + k^2/R^2}$ with $k^2/R^2 = 2/5$: $\\dfrac{2/5}{7/5} = 2/7$."],
      ["a uniform disc", `$${frac(1, 3)}$`, "With $k^2/R^2 = 1/2$: $\\dfrac{1/2}{3/2} = 1/3$."],
      ["a thin ring", `$${frac(1, 2)}$`, "With $k^2/R^2 = 1$: $\\dfrac{1}{2}$."],
      ["a hollow sphere", `$${frac(2, 5)}$`, "With $k^2/R^2 = 2/3$: $\\dfrac{2/3}{5/3} = 2/5$."],
    ],
    (b) => `For ${b} rolling without slipping on a horizontal surface, the fraction of its total kinetic energy that is rotational is`,
    "Write total KE as translational plus rotational, using $v = \\omega R$ and the body's radius of gyration.",
  ),
  {
    ...P, key: "ph_gh", chapter: "gravitation", topic: "gravitational-potential", difficulty: "medium", forms: ["single"],
    make: (r) => {
      const [n, d] = r.pick([[1, 1], [1, 2], [2, 1], [1, 3]]); // h = (n/d) R
      const ratioNum = d * d;
      const ratioDen = (n + d) * (n + d);
      const h = n === d ? "R" : `${frac(n, d)}R`;
      return {
        kind: "choice",
        stem: `The acceleration due to gravity at the surface of the Earth is $g$. Its value at a height $h = ${h.replace("\\dfrac", "\\tfrac")}$ above the surface ($R$ = radius of the Earth) is`,
        correct: `$${frac(ratioNum, ratioDen)}\\,g$`.replace("$1\\,g$", "$g$"),
        wrong: [`$${frac(d, n + d)}\\,g$`, `$${frac(ratioNum + 1, ratioDen + 1)}\\,g$`, `$${frac(d * d, n * n + d * d)}\\,g$`].filter((w) => w !== `$${frac(ratioNum, ratioDen)}\\,g$`).concat([`$${frac(1, 2)}\\,g$`, `$${frac(1, 8)}\\,g$`]),
        hint: "Gravity falls off as the inverse square of the distance from the Earth's centre, not from its surface.",
        steps: [
          { body: "$g_h = g\\left(\\dfrac{R}{R + h}\\right)^2$." },
          { body: `$\\dfrac{R}{R + h} = ${frac(d, n + d)}$, so $g_h = ${frac(ratioNum, ratioDen)}\\,g$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_carnot", chapter: "thermodynamics", topic: "heat-engines", difficulty: "easy",
    make: (r) => {
      const [Th, Tc] = r.pick([[500, 300], [400, 300], [600, 300], [800, 400], [1000, 600], [500, 400]]);
      const e = (1 - Tc / Th) * 100;
      return {
        kind: "value", unit: "\\%",
        stem: `A Carnot engine works between a source at $${Th}\\,\\text{K}$ and a sink at $${Tc}\\,\\text{K}$. Its efficiency, in percent, is`,
        value: e, wrong: [(Tc / Th) * 100, e / 2, 100 - e / 2],
        hint: "Carnot efficiency depends only on the two reservoir temperatures in kelvin.",
        steps: [
          { body: "$\\eta = 1 - \\dfrac{T_C}{T_H}$." },
          { body: `$\\eta = 1 - \\dfrac{${Tc}}{${Th}} = ${fmt(e / 100)} = ${fmt(e)}\\%$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_vrms", chapter: "kinetic-theory-of-gases", topic: "rms-speed", difficulty: "easy", forms: ["single"],
    make: (r) => {
      const [t1, t2, k] = r.pick([[27, 927, 2], [-73, 527, 2], [27, 2427, 3], [127, 1327, 2]]);
      return {
        kind: "choice",
        stem: `The temperature of an ideal gas is raised from $${t1}^\\circ\\text{C}$ to $${t2}^\\circ\\text{C}$. Its rms speed becomes`,
        correct: `${k} times the original`,
        wrong: [`${k * k} times the original`, `$\\sqrt{${k}}$ times the original`, "unchanged"],
        hint: "Convert to kelvin first: rms speed is proportional to the square root of absolute temperature.",
        steps: [
          { body: `$T_1 = ${t1 + 273}\\,\\text{K}$, $T_2 = ${t2 + 273}\\,\\text{K}$, so $T_2/T_1 = ${k * k}$.` },
          { body: `$v_{rms} \\propto \\sqrt{T}$, so it increases by a factor $\\sqrt{${k * k}} = ${k}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_shm", chapter: "oscillations-and-waves", topic: "simple-harmonic-motion", difficulty: "easy", forms: ["single"],
    make: (r) => {
      const k = r.pick([4, 9, 16]);
      const s = Math.sqrt(k);
      const which = r.pick(["mass", "spring"]);
      return which === "mass"
        ? {
            kind: "choice",
            stem: `A mass on a spring oscillates with period $T$. If the mass is made ${k} times larger, the new period is`,
            correct: `$${s}T$`, wrong: [`$${k}T$`, `$\\dfrac{T}{${s}}$`, "$T$"],
            hint: "The period of a spring–mass oscillator depends on the square root of the mass.",
            steps: [{ body: "$T = 2\\pi\\sqrt{m/k}$, so $T \\propto \\sqrt m$." }, { body: `New period $= \\sqrt{${k}}\\,T = ${s}T$.` }],
          }
        : {
            kind: "choice",
            stem: `A mass on a spring oscillates with period $T$. If the spring is replaced by one ${k} times stiffer, the new period is`,
            correct: `$\\dfrac{T}{${s}}$`, wrong: [`$${s}T$`, `$\\dfrac{T}{${k}}$`, "$T$"],
            hint: "A stiffer spring means faster oscillations; check how the period depends on $k$.",
            steps: [{ body: "$T = 2\\pi\\sqrt{m/k}$, so $T \\propto 1/\\sqrt k$." }, { body: `New period $= T/\\sqrt{${k}} = T/${s}$.` }],
          };
    },
  },
  {
    ...P, key: "ph_coul", chapter: "electrostatics", topic: "coulombs-law", difficulty: "easy", forms: ["single"],
    make: (r) => {
      const a = r.pick([2, 3]);
      const b = r.pick([2, 3, 0.5]);
      const factor = (a * a) / (b * b);
      const bTxt = b === 0.5 ? "halved" : `made ${b} times larger`;
      return {
        kind: "choice",
        stem: `Two point charges repel each other with a force $F$. If each charge is made ${a} times larger and the separation is ${bTxt}, the new force is`,
        correct: `$${fmt(factor)}F$`, wrong: [`$${fmt((a * a) / b)}F$`, `$${fmt(a / (b * b))}F$`, `$${fmt(factor * 2)}F$`],
        hint: "Force scales with the product of the charges and with the inverse square of the distance.",
        steps: [
          { body: "$F \\propto \\dfrac{q_1 q_2}{r^2}$." },
          { body: `New force $= \\dfrac{${a} \\times ${a}}{(${fmt(b)})^2}F = ${fmt(factor)}F$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_cap", chapter: "electrostatics", topic: "capacitors", difficulty: "easy",
    make: (r) => {
      const C = r.pick([2, 4, 5, 10]);
      const V = r.pick([10, 20, 50, 100]);
      const U = 0.5 * C * V * V / 1000; // mJ
      return {
        kind: "value", unit: "mJ",
        stem: `A capacitor of capacitance $${C}\\,\\mu\\text{F}$ is charged to $${V}\\,\\text{V}$. The energy stored in it, in millijoules, is`,
        value: U, wrong: [U * 2, (C * V) / 1000, U / 2],
        hint: "Energy in a capacitor goes as the square of the voltage.",
        steps: [
          { body: "$U = \\tfrac12 CV^2$." },
          { body: `$U = \\tfrac12 (${C}\\times10^{-6})(${V})^2 = ${fmt(U)}\\times10^{-3}\\,\\text{J} = ${fmt(U)}\\,\\text{mJ}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_res", chapter: "current-electricity", topic: "cells-in-series-and-parallel", difficulty: "easy",
    make: (r) => {
      const [R2, R3] = r.pick([[6, 3], [12, 6], [4, 4], [10, 15], [20, 5]]);
      const R1 = r.pick([1, 2, 3, 5]);
      const p = (R2 * R3) / (R2 + R3);
      const eq = R1 + p;
      return {
        kind: "value", unit: "\\Omega",
        stem: `A $${R1}\\,\\Omega$ resistor is connected in series with a parallel combination of $${R2}\\,\\Omega$ and $${R3}\\,\\Omega$. The equivalent resistance, in ohms, is`,
        value: eq, wrong: [R1 + R2 + R3, p, R1 + (R2 + R3) / 2],
        hint: "Reduce the parallel pair to a single resistor first, then add the series one.",
        steps: [
          { body: `Parallel pair: $\\dfrac{${R2} \\times ${R3}}{${R2} + ${R3}} = ${fmt(p)}\\,\\Omega$.` },
          { body: `Series: $${R1} + ${fmt(p)} = ${fmt(eq)}\\,\\Omega$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_stretch", chapter: "current-electricity", topic: "kirchhoffs-laws", difficulty: "medium", forms: ["single"],
    make: (r) => {
      const n = r.pick([2, 3, 4]);
      return {
        kind: "choice",
        stem: `A wire of resistance $R$ is stretched uniformly until its length becomes ${n} times the original. Its new resistance is`,
        correct: `$${n * n}R$`, wrong: [`$${n}R$`, `$${n ** 3}R$`, `$\\dfrac{R}{${n}}$`],
        hint: "Stretching keeps the volume fixed, so the area falls as the length rises.",
        steps: [
          { body: "Volume constant: $A' = A/" + n + "$ when $l' = " + n + "l$." },
          { body: `$R' = \\rho\\dfrac{${n}l}{A/${n}} = ${n * n}R$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_lcr", chapter: "electromagnetic-induction-and-alternating-currents", topic: "lcr-circuits", difficulty: "medium",
    make: (r) => {
      const [a, b, c] = r.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 6, 10]]);
      const k = r.pick([1, 10]);
      const XC = r.pick([2, 5, 10]) * k;
      const XL = XC + b * k;
      return {
        kind: "value", unit: "\\Omega",
        stem: `In a series LCR circuit, $R = ${a * k}\\,\\Omega$, $X_L = ${XL}\\,\\Omega$ and $X_C = ${XC}\\,\\Omega$. The impedance of the circuit, in ohms, is`,
        value: c * k, wrong: [a * k + XL - XC, a * k + XL + XC, Math.sqrt((a * k) ** 2 + XL * XL) | 0],
        hint: "Inductive and capacitive reactances act in opposite directions on the phasor diagram.",
        steps: [
          { body: "$Z = \\sqrt{R^2 + (X_L - X_C)^2}$." },
          { body: `$Z = \\sqrt{${a * k}^2 + ${b * k}^2} = ${c * k}\\,\\Omega$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_lens", chapter: "optics", topic: "lenses-and-mirrors", difficulty: "medium",
    make: (r) => {
      const [f, u, v] = r.pick([[10, 15, 30], [10, 20, 20], [20, 30, 60], [15, 20, 60], [12, 18, 36], [20, 60, 30], [10, 30, 15]]);
      return {
        kind: "value", unit: "cm",
        stem: `An object is placed $${u}\\,\\text{cm}$ in front of a thin convex lens of focal length $${f}\\,\\text{cm}$. The distance of the image from the lens, in cm, is`,
        value: v, wrong: [u + f, (u * f) / (u + f), v / 2],
        hint: "Use the lens formula with the sign convention: the object distance is negative.",
        steps: [
          { body: "$\\dfrac1v - \\dfrac1u = \\dfrac1f$ with $u = -" + u + "\\,\\text{cm}$." },
          { body: `$\\dfrac1v = \\dfrac1{${f}} - \\dfrac1{${u}} = \\dfrac1{${v}}$, so $v = ${v}\\,\\text{cm}$ (real image, other side).` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_ydse", chapter: "optics", topic: "interference", difficulty: "medium",
    make: (r) => {
      const lam = r.pick([400, 500, 600, 700]);
      const D = r.pick([1, 1.5, 2]);
      const d = r.pick([0.5, 1, 2]);
      const beta = (lam * 1e-9 * D) / (d * 1e-3) * 1e3; // mm
      return {
        kind: "value", unit: "mm", tolerance: 0.01,
        stem: `In Young's double-slit experiment, light of wavelength $${lam}\\,\\text{nm}$ is used, the slits are $${d}\\,\\text{mm}$ apart and the screen is $${D}\\,\\text{m}$ away. The fringe width, in mm, is`,
        value: Number(beta.toFixed(2)), wrong: [Number((beta * 2).toFixed(2)), Number((beta / 2).toFixed(2)), Number((beta * 1.5).toFixed(2))],
        hint: "Fringe width grows with wavelength and screen distance, and shrinks with slit separation.",
        steps: [
          { body: "$\\beta = \\dfrac{\\lambda D}{d}$." },
          { body: `$\\beta = \\dfrac{${lam}\\times10^{-9} \\times ${D}}{${d}\\times10^{-3}} = ${fmt(beta, 2)}\\,\\text{mm}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_photo", chapter: "dual-nature-of-matter-and-radiation", topic: "photoelectric-effect", difficulty: "easy",
    make: (r) => {
      const phi = r.pick([2, 2.5, 3, 4.5]);
      const E = phi + r.pick([1, 1.5, 2, 3]);
      const K = E - phi;
      return {
        kind: "value", unit: "V",
        stem: `Photons of energy $${E}\\,\\text{eV}$ fall on a metal surface of work function $${phi}\\,\\text{eV}$. The stopping potential, in volts, is`,
        value: K, wrong: [E, E + phi, phi],
        hint: "Einstein's photoelectric equation gives the maximum kinetic energy; the stopping potential cancels exactly that.",
        steps: [
          { body: "$K_{max} = h\\nu - \\phi$." },
          { body: `$K_{max} = ${E} - ${phi} = ${fmt(K)}\\,\\text{eV}$, so $V_0 = ${fmt(K)}\\,\\text{V}$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_decay", chapter: "atoms-and-nuclei", topic: "radioactive-decay", difficulty: "easy",
    make: (r) => {
      const th = r.pick([2, 5, 10, 20]);
      const n = r.pick([2, 3, 4]);
      const pct = 100 / 2 ** n;
      return {
        kind: "value", unit: "\\%",
        stem: `A radioactive sample has a half-life of $${th}$ days. The percentage of the sample remaining undecayed after $${th * n}$ days is`,
        value: pct, wrong: [100 / n, 100 - pct, pct * 2],
        hint: "Count how many half-lives have passed; each one halves what is left.",
        steps: [
          { body: `Number of half-lives $= ${th * n}/${th} = ${n}$.` },
          { body: `Remaining $= (1/2)^{${n}} = ${fmt(pct / 100, 4)} = ${fmt(pct)}\\%$.` },
        ],
      };
    },
  },
  {
    ...P, key: "ph_bohr", chapter: "atoms-and-nuclei", topic: "bohr-model", difficulty: "easy", forms: ["single"],
    make: (r) => {
      const n = r.pick([2, 3, 4]);
      const E = -13.6 / (n * n);
      return {
        kind: "value", unit: "eV",
        stem: `The energy of the electron in the $n = ${n}$ orbit of a hydrogen atom is`,
        value: Number(E.toFixed(2)), wrong: [Number((-13.6 / n).toFixed(2)), Number((13.6 / (n * n)).toFixed(2)), -13.6],
        hint: "Bohr energies scale as $1/n^2$ and are negative for bound states.",
        steps: [{ body: "$E_n = -\\dfrac{13.6}{n^2}\\,\\text{eV}$." }, { body: `$E_{${n}} = -\\dfrac{13.6}{${n * n}} = ${fmt(E, 2)}\\,\\text{eV}$.` }],
      };
    },
  },
  mapping(
    { ...P, key: "ph_gates", chapter: "electronic-devices", topic: "logic-gates", difficulty: "easy" },
    [
      ["gives an output of 1 only when both inputs are 1", "AND gate", "That is the AND truth table: $Y = A\\cdot B$."],
      ["gives an output of 0 only when both inputs are 1", "NAND gate", "NAND is AND followed by NOT: $Y = \\overline{A\\cdot B}$."],
      ["gives an output of 1 only when both inputs are 0", "NOR gate", "NOR is OR followed by NOT: $Y = \\overline{A + B}$."],
      ["gives an output of 1 only when the two inputs differ", "XOR gate", "XOR: $Y = A\\bar B + \\bar A B$."],
      ["gives an output of 0 only when both inputs are 0", "OR gate", "OR is 1 whenever at least one input is 1."],
    ],
    (g) => `A two-input logic gate that ${g} is the`,
    "Write out the four rows of the truth table and compare.",
  ),
  statements(
    { ...P, key: "ph_ms_cond", chapter: "electrostatics", topic: "electric-potential", difficulty: "hard" },
    "A charged conductor is in electrostatic equilibrium. Which of the following statements are correct?",
    [
      ["The electric field inside the conductor is zero.", "otherwise free charges would keep moving."],
      ["All excess charge resides on the outer surface.", "Gauss's law with a surface just inside the conductor encloses no charge."],
      ["The entire conductor is at the same potential.", "zero field inside means no potential difference between any two points."],
      ["The field just outside the surface is perpendicular to it.", "a tangential component would drive surface currents."],
    ],
    [
      ["The potential inside the conductor is zero.", "it equals the (generally non-zero) surface potential."],
      ["Surface charge density is the same everywhere on any conductor.", "it is larger where the surface is more sharply curved."],
      ["The field just outside is tangential to the surface.", "it is normal to the surface."],
    ],
  ),
  statements(
    { ...P, key: "ph_ms_shm", chapter: "oscillations-and-waves", topic: "simple-harmonic-motion", difficulty: "hard" },
    "A particle executes simple harmonic motion. Which of the following statements are correct?",
    [
      ["Its speed is maximum at the mean position.", "all the energy is kinetic there."],
      ["Its acceleration is maximum at the extreme positions.", "$a = -\\omega^2 x$ is largest in magnitude where $|x|$ is largest."],
      ["The total mechanical energy remains constant.", "SHM with no damping conserves energy."],
      ["Acceleration is always directed towards the mean position.", "that is the defining restoring property of SHM."],
    ],
    [
      ["Its acceleration is maximum at the mean position.", "acceleration is zero at the mean position."],
      ["Kinetic energy is maximum at the extreme positions.", "the particle is momentarily at rest there."],
      ["The period depends on the amplitude.", "SHM is isochronous: the period is independent of amplitude."],
    ],
  ),
];

