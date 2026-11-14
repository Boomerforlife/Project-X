"""Tiny JSON Schema validator (jsonschema is not a project dependency). Supports the subset zod emits."""

from __future__ import annotations

import re
from typing import Any


class SchemaError(Exception):
    pass


def _resolve(root: dict[str, Any], ref: str) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise SchemaError(f"unsupported $ref {ref}")
    node: Any = root
    for part in ref[2:].split("/"):
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return node


def _type_ok(value: Any, t: str) -> bool:
    return {
        "null": value is None,
        "boolean": isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "string": isinstance(value, str),
        "array": isinstance(value, list),
        "object": isinstance(value, dict),
    }[t]


def validate(value: Any, schema: dict[str, Any] | bool, root: dict[str, Any] | None = None, path: str = "$") -> None:
    root = root or (schema if isinstance(schema, dict) else {})
    if schema is True:
        return
    if schema is False:
        raise SchemaError(f"{path}: schema is false")
    if "$ref" in schema:
        validate(value, _resolve(root, schema["$ref"]), root, path)
        return
    if "const" in schema and value != schema["const"]:
        raise SchemaError(f"{path}: expected const {schema['const']!r}, got {value!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise SchemaError(f"{path}: {value!r} not in enum {schema['enum']}")
    for key in ("allOf",):
        for sub in schema.get(key, []):
            validate(value, sub, root, path)
    for key in ("anyOf", "oneOf"):
        if key in schema:
            errors = []
            for sub in schema[key]:
                try:
                    validate(value, sub, root, path)
                    break
                except SchemaError as e:
                    errors.append(str(e))
            else:
                raise SchemaError(f"{path}: no {key} branch matched: {errors[:3]}")
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(value, t) for t in types):
            raise SchemaError(f"{path}: expected type {types}, got {type(value).__name__}")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            raise SchemaError(f"{path}: shorter than minLength")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            raise SchemaError(f"{path}: longer than maxLength")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            raise SchemaError(f"{path}: does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise SchemaError(f"{path}: below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise SchemaError(f"{path}: above maximum")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            raise SchemaError(f"{path}: fewer than minItems")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            raise SchemaError(f"{path}: more than maxItems")
        for i, sub in enumerate(schema.get("prefixItems", [])):
            if i < len(value):
                validate(value[i], sub, root, f"{path}[{i}]")
        if "items" in schema and isinstance(schema["items"], (dict, bool)):
            start = len(schema.get("prefixItems", []))
            for i, item in enumerate(value[start:], start):
                validate(item, schema["items"], root, f"{path}[{i}]")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for req in schema.get("required", []):
            if req not in value:
                raise SchemaError(f"{path}: missing required property {req!r}")
        for k, v in value.items():
            if k in props:
                validate(v, props[k], root, f"{path}.{k}")
            else:
                ap = schema.get("additionalProperties", True)
                if ap is False:
                    raise SchemaError(f"{path}: unexpected property {k!r}")
                if isinstance(ap, dict):
                    validate(v, ap, root, f"{path}.{k}")
