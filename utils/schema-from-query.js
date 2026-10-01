'use strict';
// Derives a JSON Schema for a GraphQL *response* from (introspected schema + the query document).
// Nothing is guessed: types, nullability and enum values all come from the introspection snapshot.
const { parse, Kind, isNonNullType, isListType, isScalarType, isEnumType, isAbstractType } = require('graphql');
const { failed } = require('../schemas/helpers');

const SCALARS = {
  ID: { type: 'string', minLength: 1 }, String: { type: 'string' }, Int: { type: 'integer' },
  Float: { type: 'number' }, Boolean: { type: 'boolean' },
  DateTime: { type: 'string', format: 'date-time' }, Date: { type: 'string', format: 'date' },
  UUID: { type: 'string' }, JSONString: { type: 'string' },
  Decimal: { type: ['number', 'string'] }, PositiveDecimal: { type: ['number', 'string'] },
  WeightScalar: { type: ['number', 'string'] }, Minute: { type: 'number' }, Hour: { type: 'number' },
};

const wrap = (s, nullable) => {
  if (!nullable || !s.type) return s; // untyped ({}) already accepts null
  const out = { ...s, type: [...new Set([].concat(s.type, 'null'))] };
  if (s.enum) out.enum = [...s.enum, null];
  return out;
};

function buildResponseSchema(schema, query, operationName) {
  const doc = parse(query);
  const fragments = {};
  const ops = [];
  for (const d of doc.definitions) {
    if (d.kind === Kind.FRAGMENT_DEFINITION) fragments[d.name.value] = d;
    else if (d.kind === Kind.OPERATION_DEFINITION) ops.push(d);
  }
  const op = (operationName && ops.find((o) => o.name && o.name.value === operationName)) || ops[0];
  if (!op) throw new Error('No operation found in document');
  const unknownScalars = new Set();

  const rootType = { query: schema.getQueryType(), mutation: schema.getMutationType(), subscription: schema.getSubscriptionType() }[op.operation];

  function objectSchema(parentType, selectionSet) {
    const byKey = new Map(); // key -> { def, nodes, optional }
    const visit = (typeCtx, set, conditional) => {
      for (const s of set.selections) {
        if (s.kind === Kind.FIELD) {
          const key = (s.alias && s.alias.value) || s.name.value;
          const optional = conditional || (s.directives || []).some((d) => ['skip', 'include'].includes(d.name.value));
          if (s.name.value === '__typename') {
            byKey.set(key, { typename: !isAbstractType(parentType) ? parentType.name : null, optional });
            continue;
          }
          const def = typeCtx.getFields()[s.name.value];
          if (!def) throw new Error(`Field "${s.name.value}" does not exist on type "${typeCtx.name}" in the introspection snapshot`);
          const prev = byKey.get(key);
          if (prev) { prev.nodes.push(s); prev.optional = prev.optional && optional; }
          else byKey.set(key, { def, nodes: [s], optional });
        } else {
          const frag = s.kind === Kind.FRAGMENT_SPREAD ? fragments[s.name.value] : s;
          if (!frag) throw new Error(`Unknown fragment "${s.name.value}"`);
          const condName = frag.typeCondition && frag.typeCondition.name.value;
          const condType = condName ? schema.getType(condName) : typeCtx;
          visit(condType, frag.selectionSet, conditional || (condType && condType.name !== typeCtx.name));
        }
      }
    };
    visit(parentType, selectionSet, false);

    const properties = {};
    const required = [];
    for (const [key, entry] of byKey) {
      if (entry.def) {
        const combined = { selections: entry.nodes.flatMap((n) => (n.selectionSet ? n.selectionSet.selections : [])) };
        properties[key] = convert(entry.def.type, combined, true);
      } else {
        properties[key] = entry.typename ? { type: 'string', const: entry.typename } : { type: 'string' };
      }
      if (!entry.optional) required.push(key);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }

  function convert(type, sel, nullable) {
    if (isNonNullType(type)) return convert(type.ofType, sel, false);
    if (isListType(type)) return wrap({ type: 'array', items: convert(type.ofType, sel, true) }, nullable);
    if (isEnumType(type)) return wrap({ type: 'string', enum: type.getValues().map((v) => v.name) }, nullable);
    if (isScalarType(type)) {
      const s = SCALARS[type.name];
      if (!s) { unknownScalars.add(type.name); return {}; }
      return wrap(s, nullable);
    }
    return wrap(objectSchema(type, sel), nullable);
  }

  const success = {
    type: 'object',
    properties: { data: objectSchema(rootType, op.selectionSet), extensions: { type: 'object' } },
    required: ['data'],
    additionalProperties: false,
  };
  return { operationName: (op.name && op.name.value) || '(anonymous)', success, failure: failed, unknownScalars: [...unknownScalars] };
}

module.exports = { buildResponseSchema };
