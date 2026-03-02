begin;

with seed(title, message, priority, created_by) as (
  values
    (
      'Revisión trimestral de EPIs',
      'El miércoles a las 09:00 se realizará revisión completa de EPIs en sala de material.',
      2,
      'sistema'
    ),
    (
      'Simulacro en Parque Norte',
      'Mañana a las 11:30 hay simulacro coordinado con Protección Civil. Confirmar asistencia.',
      3,
      'sistema'
    ),
    (
      'Actualización de protocolo de comunicaciones',
      'Se publica versión 2.1 del protocolo de radio. Aplicación inmediata en todos los turnos.',
      2,
      'sistema'
    ),
    (
      'Avería eléctrica en nave 2',
      'Detectada incidencia eléctrica en nave 2. Zona balizada hasta reparación.',
      4,
      'sistema'
    ),
    (
      'Mantenimiento programado U19',
      'La unidad U19 entra en mantenimiento preventivo el viernes por la tarde.',
      1,
      'sistema'
    ),
    (
      'Inventario mensual',
      'Recordatorio: cerrar inventario mensual antes del día 5 de cada mes.',
      1,
      'sistema'
    )
)
insert into public.news_messages (title, message, priority, created_by)
select s.title, s.message, s.priority, s.created_by
from seed s
where not exists (
  select 1
  from public.news_messages n
  where lower(n.title) = lower(s.title)
);

commit;
