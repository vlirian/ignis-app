begin;

with seed(title, location, description, severity, status, reported_by) as (
  values
    (
      'Solicitud de quema hierbas y botes de gas',
      'Jefatura / Compras',
      'Pendiente pedir quema hierbas y botes de gas.',
      'media',
      'activa',
      'jefatura'
    ),
    (
      'Pedir EPI de motosierra para unidades',
      'Material / Unidades',
      'Solicitar EPI de motosierra para las unidades U01, U03, U04, U07, U14, U15 y U20.',
      'alta',
      'activa',
      'jefatura'
    ),
    (
      'Avería central telefónica (7 líneas)',
      'Central',
      'De los 7 teléfonos de la central solo se puede llamar con 1; los demás indican líneas ocupadas. El teléfono de llamada se apaga con frecuencia por batería agotada. Se comunicó al Jefe para gestión con informática.',
      'critica',
      'activa',
      'jefatura'
    ),
    (
      'Fugas y goteras en gimnasio y vestuarios',
      'Gimnasio / Vestuarios / Entrada sala de juntas',
      'Fuga de agua en la unión de bajantes del gimnasio (se envía video). También hay goteras en la junta de dilatación de vestuarios y en la entrada a sala de juntas.',
      'alta',
      'activa',
      'jefatura'
    )
)
insert into public.jefatura_incidents (title, location, description, severity, status, reported_by)
select s.title, s.location, s.description, s.severity, s.status, s.reported_by
from seed s
where not exists (
  select 1
  from public.jefatura_incidents j
  where lower(j.title) = lower(s.title)
    and coalesce(lower(j.location), '') = coalesce(lower(s.location), '')
    and j.status = 'activa'
);

commit;
