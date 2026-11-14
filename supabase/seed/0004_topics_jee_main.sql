-- Seed 0004: topics for 5 JEE Main chapters (grouping of NTA unit text). slug = {chapter.slug}-{segment}.
insert into topics (chapter_id, slug, segment, name, sort_order)
select c.id, c.slug || '-' || app_private.slugify(v.name), app_private.slugify(v.name), v.name, v.ord
from (values
  ('jee-main-physics-kinematics', 1, 'Frame of Reference and Motion in a Straight Line'),
  ('jee-main-physics-kinematics', 2, 'Motion Graphs'),
  ('jee-main-physics-kinematics', 3, 'Uniformly Accelerated Motion'),
  ('jee-main-physics-kinematics', 4, 'Scalars and Vectors'),
  ('jee-main-physics-kinematics', 5, 'Relative Velocity'),
  ('jee-main-physics-kinematics', 6, 'Projectile Motion'),
  ('jee-main-physics-kinematics', 7, 'Uniform Circular Motion'),
  ('jee-main-physics-laws-of-motion', 1, 'Newton''s Laws of Motion'),
  ('jee-main-physics-laws-of-motion', 2, 'Momentum and Impulse'),
  ('jee-main-physics-laws-of-motion', 3, 'Conservation of Linear Momentum'),
  ('jee-main-physics-laws-of-motion', 4, 'Equilibrium of Concurrent Forces'),
  ('jee-main-physics-laws-of-motion', 5, 'Friction'),
  ('jee-main-physics-laws-of-motion', 6, 'Dynamics of Uniform Circular Motion'),
  ('jee-main-chemistry-some-basic-concepts-in-chemistry', 1, 'Matter and its Nature'),
  ('jee-main-chemistry-some-basic-concepts-in-chemistry', 2, 'Laws of Chemical Combination'),
  ('jee-main-chemistry-some-basic-concepts-in-chemistry', 3, 'Atomic and Molecular Masses'),
  ('jee-main-chemistry-some-basic-concepts-in-chemistry', 4, 'Mole Concept and Molar Mass'),
  ('jee-main-chemistry-some-basic-concepts-in-chemistry', 5, 'Chemical Formulae and Stoichiometry'),
  ('jee-main-chemistry-atomic-structure', 1, 'Electromagnetic Radiation and Photoelectric Effect'),
  ('jee-main-chemistry-atomic-structure', 2, 'Hydrogen Spectrum and Bohr Model'),
  ('jee-main-chemistry-atomic-structure', 3, 'Dual Nature and Uncertainty Principle'),
  ('jee-main-chemistry-atomic-structure', 4, 'Quantum Mechanical Model and Quantum Numbers'),
  ('jee-main-chemistry-atomic-structure', 5, 'Shapes of Orbitals and Electronic Configuration'),
  ('jee-main-mathematics-complex-numbers-and-quadratic-equations', 1, 'Algebra of Complex Numbers'),
  ('jee-main-mathematics-complex-numbers-and-quadratic-equations', 2, 'Argand Plane, Modulus and Argument'),
  ('jee-main-mathematics-complex-numbers-and-quadratic-equations', 3, 'Quadratic Equations and their Solutions'),
  ('jee-main-mathematics-complex-numbers-and-quadratic-equations', 4, 'Relations between Roots and Coefficients'),
  ('jee-main-mathematics-complex-numbers-and-quadratic-equations', 5, 'Nature and Formation of Quadratic Equations')
) as v(chapter_slug, ord, name)
join chapters c on c.slug = v.chapter_slug
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order;
