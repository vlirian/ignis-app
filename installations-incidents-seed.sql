begin;

with seed(title, location, description, severity, status, reported_by) as (
  values
    (
      'Tubos de aspiración de gases rotos',
      'Parque · Cocheras',
      'Tubos de aspiración de gases de las unidades U03, U04, U05, U08 y U15 rotos.',
      'alta',
      'activa',
      'administracion'
    ),
    (
      'Bajante de terraza sala TV rajado',
      'Gimnasio',
      'Bajante de la terraza de sala TV rajado; actualmente tiene una bolsa liada.',
      'media',
      'activa',
      'administracion'
    ),
    (
      'Atasco en urinarios (baño junto dormitorio pequeño)',
      'Zona dormitorios / baños',
      'Techo de baños dormitorios con incidencia. Urinarios del baño junto al dormitorio pequeño atascados. Jesús (oficina) informará el lunes a José Alberto para probar productos de limpieza y desatasco; si no funciona, se dará aviso para reparación.',
      'alta',
      'activa',
      'administracion'
    ),
    (
      'Entra agua por ventana derecha del despacho de sargentos',
      'Despacho de sargentos',
      'La ventana derecha del despacho de sargentos presenta entrada de agua.',
      'media',
      'activa',
      'administracion'
    )
)
insert into public.installation_incidents (title, location, description, severity, status, reported_by)
select s.title, s.location, s.description, s.severity, s.status, s.reported_by
from seed s
where not exists (
  select 1
  from public.installation_incidents i
  where lower(i.title) = lower(s.title)
    and coalesce(lower(i.location), '') = coalesce(lower(s.location), '')
    and i.status = 'activa'
);

commit;
