-- DEV-ONLY fixture (never load in production): 8 clearly synthetic `demo-*` questions, origin EDITORIAL, source PROJECTX_EDITORIAL.
--   6 PUBLISHED (2 SINGLE_MCQ, 2 MULTI_MCQ, 2 NUMERICAL; HUMAN_VERIFIED; APPROVED solution; sitemap_include=false)
--   1 DRAFT (no solution), 1 DISPUTED (DRAFT) for negative tests.
-- Deterministic ids: question d0000000-0000-4000-8000-0000000000NN, options d1000000-...-<NN><k>, solutions d2000000-...-0000000000NN.
-- Idempotent: skips any question whose slug already exists.
do $fixture$
declare
  defs jsonb := $json$[
    {"n":1,"slug":"demo-constant-acceleration-distance","chapter":"jee-main-physics-kinematics","topic":"jee-main-physics-kinematics-uniformly-accelerated-motion",
     "type":"SINGLE_MCQ","difficulty":"EASY","status":"PUBLISHED",
     "text":"[DEMO] A particle starts from rest with constant acceleration $2\\,\\text{m/s}^2$. What distance does it cover in the first $3$ s?",
     "options":["$4$ m","$9$ m","$12$ m","$18$ m"],"correct":["B"],
     "summary":"Use $s = \\tfrac{1}{2}at^2$ with $u = 0$.",
     "steps":["Starting from rest, $s = \\tfrac{1}{2} a t^2$.","Substitute $a = 2$ and $t = 3$: $s = \\tfrac{1}{2}\\cdot 2\\cdot 9 = 9$ m."]},
    {"n":2,"slug":"demo-hydrogen-n3-orbitals","chapter":"jee-main-chemistry-atomic-structure","topic":"jee-main-chemistry-atomic-structure-quantum-mechanical-model-and-quantum-numbers",
     "type":"SINGLE_MCQ","difficulty":"EASY","status":"PUBLISHED",
     "text":"[DEMO] How many orbitals are present in the $n = 3$ shell of a hydrogen atom?",
     "options":["$3$","$6$","$9$","$16$"],"correct":["C"],
     "summary":"The number of orbitals in shell $n$ is $n^2$.",
     "steps":["The number of orbitals in the $n$-th shell is $n^2$.","For $n = 3$ this gives $9$ orbitals."]},
    {"n":3,"slug":"demo-vector-quantities","chapter":"jee-main-physics-kinematics","topic":"jee-main-physics-kinematics-scalars-and-vectors",
     "type":"MULTI_MCQ","difficulty":"MEDIUM","status":"PUBLISHED",
     "text":"[DEMO] Which of the following physical quantities are vectors? (One or more options may be correct.)",
     "options":["Displacement","Speed","Velocity","Distance"],"correct":["A","C"],
     "summary":"Vectors have both magnitude and direction.",
     "steps":["Displacement and velocity have magnitude and direction, so they are vectors.","Speed and distance are scalars."]},
    {"n":4,"slug":"demo-roots-of-minus-one","chapter":"jee-main-mathematics-complex-numbers-and-quadratic-equations","topic":"jee-main-mathematics-complex-numbers-and-quadratic-equations-algebra-of-complex-numbers",
     "type":"MULTI_MCQ","difficulty":"MEDIUM","status":"PUBLISHED",
     "text":"[DEMO] Which of the following are roots of $z^2 = -1$? (One or more options may be correct.)",
     "options":["$i$","$-i$","$1$","$-1$"],"correct":["A","B"],
     "summary":"$z^2 = -1$ has exactly the roots $\\pm i$.",
     "steps":["$z^2 + 1 = 0$ factors as $(z - i)(z + i) = 0$.","Hence $z = i$ or $z = -i$."]},
    {"n":5,"slug":"demo-nitrogen-unpaired-electrons","chapter":"jee-main-chemistry-atomic-structure","topic":"jee-main-chemistry-atomic-structure-shapes-of-orbitals-and-electronic-configuration",
     "type":"NUMERICAL","difficulty":"EASY","status":"PUBLISHED",
     "text":"[DEMO] The number of unpaired electrons in a ground-state nitrogen atom ($Z = 7$) is ______.",
     "numeric":{"min":"3","max":"3","display":"3"},
     "summary":"Nitrogen is $1s^2 2s^2 2p^3$; Hund's rule puts one electron in each $2p$ orbital.",
     "steps":["Electronic configuration: $1s^2 2s^2 2p^3$.","By Hund's rule the three $2p$ electrons occupy separate orbitals, so there are $3$ unpaired electrons."]},
    {"n":6,"slug":"demo-modulus-of-3-plus-4i","chapter":"jee-main-mathematics-complex-numbers-and-quadratic-equations","topic":"jee-main-mathematics-complex-numbers-and-quadratic-equations-argand-plane-modulus-and-argument",
     "type":"NUMERICAL","difficulty":"EASY","status":"PUBLISHED",
     "text":"[DEMO] The modulus of the complex number $3 + 4i$ is ______.",
     "numeric":{"min":"5","max":"5","display":"5"},
     "summary":"$|a + bi| = \\sqrt{a^2 + b^2}$.",
     "steps":["$|3 + 4i| = \\sqrt{3^2 + 4^2} = \\sqrt{25} = 5$."]},
    {"n":7,"slug":"demo-draft-unreviewed-question","chapter":"jee-main-physics-kinematics","topic":null,
     "type":"SINGLE_MCQ","difficulty":null,"status":"DRAFT",
     "text":"[DEMO] This draft question has no solution yet and must never be public. Which option is correct?",
     "options":["Option one","Option two","Option three","Option four"],"correct":null},
    {"n":8,"slug":"demo-disputed-question","chapter":"jee-main-physics-kinematics","topic":null,
     "type":"SINGLE_MCQ","difficulty":"MEDIUM","status":"DISPUTED",
     "text":"[DEMO] This question was reported as having a wrong key and must not be public. Which option is correct?",
     "options":["Option one","Option two","Option three","Option four"],"correct":["A"],
     "summary":"Disputed demo solution.","steps":["Placeholder step."]}
  ]$json$;
  d jsonb;
  v_exam uuid;
  v_source uuid;
  v_chapter public.chapters;
  v_topic uuid;
  v_qid uuid;
  v_sid uuid;
  v_n int;
  v_type text;
  v_labels text[] := array['A','B','C','D','E'];
  v_i int;
  v_opt_ids uuid[];
  v_answer jsonb;
  v_steps jsonb;
  v_status text;
begin
  select id into v_exam from public.exams where slug = 'jee-main';
  select id into v_source from public.sources where code = 'PROJECTX_EDITORIAL';
  if v_exam is null or v_source is null then
    raise exception 'fixtures require seeds 0001-0005 to be applied first';
  end if;

  for d in select value from jsonb_array_elements(defs) loop
    v_n := (d ->> 'n')::int;
    v_type := d ->> 'type';
    v_status := d ->> 'status';
    continue when exists (select 1 from public.questions where slug = d ->> 'slug');

    select c.* into v_chapter from public.chapters c where c.slug = d ->> 'chapter';
    select t.id into v_topic from public.topics t where t.slug = d ->> 'topic';
    v_qid := ('d0000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid;
    v_sid := ('d2000000-0000-4000-8000-' || lpad(v_n::text, 12, '0'))::uuid;

    -- option ids (deterministic)
    v_opt_ids := '{}';
    if v_type <> 'NUMERICAL' then
      for v_i in 0 .. jsonb_array_length(d -> 'options') - 1 loop
        v_opt_ids := v_opt_ids || ('d1000000-0000-4000-8000-' || lpad(v_n::text, 8, '0') || lpad(v_i::text, 4, '0'))::uuid;
      end loop;
    end if;

    -- answer key
    v_answer := null;
    if v_type = 'NUMERICAL' then
      v_answer := jsonb_build_object('type', 'NUMERICAL',
        'accepted_ranges', jsonb_build_array(jsonb_build_object('min', d #>> '{numeric,min}', 'max', d #>> '{numeric,max}')),
        'display_value', d #>> '{numeric,display}');
    elsif d -> 'correct' is not null and jsonb_typeof(d -> 'correct') = 'array' then
      v_answer := jsonb_build_object('type', v_type, 'correct_option_ids',
        (select jsonb_agg(v_opt_ids[array_position(v_labels, l.value) ] order by v_opt_ids[array_position(v_labels, l.value)]::text)
           from jsonb_array_elements_text(d -> 'correct') as l(value)));
    end if;

    insert into public.questions (
      id, slug, exam_id, subject_id, chapter_id, topic_id, origin, question_type, difficulty, marks, negative_marks,
      question_text, structured_content, answer_key, answer_key_source, source_id, ingestion_status,
      verification_status, publication_status, sitemap_include, year)
    values (
      v_qid, d ->> 'slug', v_exam, v_chapter.subject_id, v_chapter.id, v_topic, 'EDITORIAL', v_type::public.question_type,
      nullif(d ->> 'difficulty', '')::public.difficulty, 4, case when v_type = 'NUMERICAL' then 0 else 1 end,
      d ->> 'text', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', d ->> 'text')),
      v_answer, case when v_answer is null then null else 'HUMAN'::public.answer_key_source end, v_source,
      case when v_status = 'DRAFT' then 'IMPORTED' else 'CHECKED' end::public.ingestion_status,
      case when v_status = 'DRAFT' then 'PENDING' else 'PENDING' end::public.verification_status,
      'DRAFT', false, null);

    if v_type <> 'NUMERICAL' then
      for v_i in 0 .. jsonb_array_length(d -> 'options') - 1 loop
        insert into public.question_options (id, question_id, label, sort_order, content, content_text)
        values (v_opt_ids[v_i + 1], v_qid, v_labels[v_i + 1], v_i,
                jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', d -> 'options' ->> v_i)),
                d -> 'options' ->> v_i);
      end loop;
    end if;

    if v_status <> 'DRAFT' then
      select jsonb_agg(jsonb_build_object('index', s.ord, 'title', null,
               'blocks', jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', s.value))) order by s.ord)
        into v_steps
        from jsonb_array_elements_text(d -> 'steps') with ordinality as s(value, ord);

      insert into public.solution_versions (id, question_id, final_answer, summary, steps, provenance, review_status, edit_note)
      values (v_sid, v_qid, v_answer, d ->> 'summary', v_steps, 'HUMAN_AUTHORED', 'APPROVED', 'Synthetic demo solution (dev fixture).');

      update public.questions
         set current_solution_id = v_sid,
             verification_status = case when v_status = 'DISPUTED' then 'DISPUTED' else 'HUMAN_VERIFIED' end::public.verification_status
       where id = v_qid;
      if v_status = 'PUBLISHED' then
        update public.questions set publication_status = 'PUBLISHED' where id = v_qid;
      end if;
    end if;
  end loop;
end
$fixture$;
