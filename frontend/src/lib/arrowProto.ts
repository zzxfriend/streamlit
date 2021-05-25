/**
 * @license
 * Copyright 2018-2020 Streamlit Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// (HK) TODO: Everything here must be heavily refactored.
// Do NOT use this in production.

import { Column, Table } from "apache-arrow"
import { range, unzip } from "lodash"
import { IArrow } from "src/autogen/proto"
import { Columns, Data, Index, IndexType, Quiver } from "./Quiver"

export interface DataFrame {
  index: Index
  columns: Columns
  data: Data
  styler?: Styler
}

interface Schema {
  index_columns: (string | RangeIndex)[]
  columns: SchemaColumn[]
  column_indexes: any[]
}

interface RangeIndex {
  kind: "range"
  name: string | null
  start: number
  step: number
  stop: number
}

interface SchemaColumn {
  field_name: string
  metadata: Record<string, any> | null
  name: string | null
  numpy_type: string
  pandas_type: string
}

export enum IndexTypes {
  UnicodeIndex = "unicode",
  RangeIndex = "range",
  CategoricalIndex = "categorical",
  IntervalIndex = "interval[int64]",
  DatetimeIndex = "datetime",
  TimedeltaIndex = "time",
  PeriodIndex = "period[Q-DEC]",
  Int64Index = "int64",
  UInt64Index = "uint64",
  Float64Index = "float64",
}

interface IndexData {
  data: any[]
  type: IndexType
}

export interface Styler {
  uuid: string
  caption?: string
  styles?: string
  displayValues?: Quiver
}

export function parseTable(element?: IArrow | null): DataFrame {
  try {
    const table = Table.from(element?.data)
    const tableStyler = element?.styler

    const schema = getSchema(table)
    const columns = getColumns(schema)
    const index = {
      data: getIndex(table, schema),
      type: getIndexType(schema),
    }
    const data = {
      data: getData(table, columns),
      type: getDataColumnType(table, schema),
    }
    const styler = tableStyler
      ? {
          caption: tableStyler.caption,
          displayValues: new Quiver(
            parseTable({ data: tableStyler.displayValues })
          ),
          styles: tableStyler.styles,
          uuid: tableStyler.uuid,
        }
      : undefined

    return {
      index,
      columns,
      data,
      // @ts-ignore
      styler,
    }
  } catch (e) {
    throw new Error(e)
  }
}

function getSchema(table: Table): Schema {
  const schema = table.schema.metadata.get("pandas")
  if (schema == null) {
    throw new Error("Table schema is missing.")
  }
  return JSON.parse(schema)
}

function getIndex(table: Table, schema: Schema): any[][] {
  return schema.index_columns.map(field => {
    const isRangeIndex = typeof field === "object" && field.kind === "range"
    if (isRangeIndex) {
      const { start, stop, step } = field as RangeIndex
      return range(start, stop, step)
    }
    const column = table.getColumn(field as any)
    return getColumnData(column)
  })
}

function getIndexType(schema: Schema): IndexType[] {
  return schema.index_columns.map(indexName => {
    if (isRangeIndex(indexName)) {
      return {
        name: IndexTypes.RangeIndex,
        meta: indexName,
      }
    }

    // Get index column from columns schema.
    const indexColumn = schema.columns.find(
      column => column.field_name === indexName
    )

    // PeriodIndex and IntervalIndex values are kept in `numpy_type` property,
    // the rest in `pandas_type`.
    return {
      name:
        indexColumn?.pandas_type === "object"
          ? (indexColumn?.numpy_type as string)
          : (indexColumn?.pandas_type as string),
      meta: indexColumn?.metadata,
    }
  })
}

function getColumns(schema: Schema): string[][] {
  const isMultiIndex = schema.column_indexes.length > 1
  return unzip(
    schema.columns
      .map(column => column.field_name)
      .filter(fieldName => !schema.index_columns.includes(fieldName))
      .map(fieldName =>
        isMultiIndex
          ? JSON.parse(
              fieldName
                .replace(/\(/g, "[")
                .replace(/\)/g, "]")
                .replace(/'/g, '"')
            )
          : [fieldName]
      )
  )
}

function getData(table: Table, columns: string[][]): any[][] {
  const rows = table.length
  const cols = columns.length > 0 ? columns[0].length : 0
  return range(0, rows).map(rowIndex =>
    range(0, cols).map(columnIndex =>
      table.getColumnAt(columnIndex)?.get(rowIndex)
    )
  )
}

function getDataColumnType(table: Table, schema: Schema): string[] {
  const rows = table.length
  return rows > 0
    ? schema.columns
        .filter(column => !schema.index_columns.includes(column.field_name))
        .map(column => column.pandas_type)
    : []
}

function getColumnData(column: Column): string[] {
  return range(0, column.length).map(rowIndex => column.get(rowIndex))
}

export function concatTables(df1: Quiver, df2: Quiver): Quiver {
  if (df1.styler || df2.styler) {
    throw new Error(`Cannot concatenate dataframes with styler.`)
  }

  // Special case if df1 is empty.
  if (isEmptyDf(df1)) {
    return df2
  }

  // Special case if df2 is empty.
  if (isEmptyDf(df2)) {
    return df1
  }

  try {
    // Always returns first df columns
    const { columns } = df1
    const index = concatIndices(df1.index, df2.index)
    const data = concatData(df1.data, df2.data)

    return new Quiver({ index, data, columns })
  } catch (e) {
    throw new Error(e.message)
  }
}

function concatIndices(firstIndices: Index, secondIndices: Index): Index {
  // Special case if `firstIndices` is empty.
  if (firstIndices.data[0].length === 0) {
    return secondIndices
  }

  // Otherwise, make sure the types match.
  if (!sameIndexTypes(firstIndices.type, secondIndices.type)) {
    throw new Error(
      `Cannot concatenate index type ${JSON.stringify(
        firstIndices.type
      )} with ${JSON.stringify(secondIndices.type)}.`
    )
  }

  // Concat the indices.
  return firstIndices.data.reduce(
    (newIndex: Index, firstIndexData: string[], index: number) => {
      const concatenatedIndex = concatIndex(
        firstIndexData,
        secondIndices.data[index],
        firstIndices.type[index]
      )
      newIndex.data.push(concatenatedIndex.data)
      newIndex.type.push(concatenatedIndex.type)
      return newIndex
    },
    { data: [], type: [] }
  )
}

function concatIndex(
  firstIndex: string[],
  secondIndex: string[],
  indexType: IndexType
): IndexData {
  // Special case for RangeIndex.
  if (indexType.name === IndexTypes.RangeIndex) {
    return concatRangeIndex(firstIndex, secondIndex, indexType)
  }

  // For the rest cases.
  return concatAnyIndex(firstIndex, secondIndex, indexType)
}

function concatRangeIndex(
  firstIndex: string[],
  secondIndex: string[],
  indexType: IndexType
): IndexData {
  let newStop = indexType.meta.stop

  return secondIndex.reduce(
    (newIndex: IndexData) => {
      newIndex.data.push(newStop)
      newStop += indexType.meta.step
      newIndex.type.meta.stop = newStop
      return newIndex
    },
    { data: firstIndex, type: indexType }
  )
}

function concatAnyIndex(
  firstIndex: string[],
  secondIndex: string[],
  indexType: IndexType
): IndexData {
  const concatenatedIndex = firstIndex.concat(secondIndex)

  // Special case for CategoricalIndex, num_categories must be increased in meta
  if (indexType.name === IndexTypes.CategoricalIndex) {
    indexType.meta.num_categories += secondIndex.length
  }

  return { data: concatenatedIndex, type: indexType }
}

function concatData(firstData: Data, secondData: Data): Data {
  // Make sure data types match.
  if (!sameDataColumnTypes(firstData.type, secondData.type)) {
    throw new Error(
      `Cannot concatenate data type ${JSON.stringify(
        firstData.type
      )} with ${JSON.stringify(secondData.type)}.`
    )
  }

  const numberOfColumns = firstData.type.length

  return {
    data: firstData.data.concat(
      secondData.data.map((data: string[]) => data.slice(0, numberOfColumns))
    ),
    type: firstData.type,
  }
}

function sameIndexTypes(
  firstType: IndexType[],
  secondType: IndexType[]
): boolean {
  // Make sure both indices have same dimensions.
  if (firstType.length !== secondType.length) {
    return false
  }

  return firstType.every(
    (firstTypeValue: IndexType, index: number) =>
      firstTypeValue.name === secondType[index].name
  )
}

function sameDataColumnTypes(
  firstType: string[],
  secondType: string[]
): boolean {
  return firstType.every(
    (firstTypeValue: string, index: number) =>
      firstTypeValue === secondType[index]
  )
}

function isRangeIndex(field: string | RangeIndex): boolean {
  return typeof field === "object" && field.kind === "range"
}

export function compareValues(a: any, b: any, type: string): number {
  if (type === "unicode") {
    return compareStrings(a, b)
  }

  return compareAny(a, b)
}

function compareStrings(a: string, b: string): number {
  const STRING_COLLATOR = new Intl.Collator("en", {
    numeric: false,
    sensitivity: "base",
  })
  // using a Collator is faster than string.localeCompare:
  // https://stackoverflow.com/questions/14677060/400x-sorting-speedup-by-switching-a-localecompareb-to-ab-1ab10/52369951#52369951
  return STRING_COLLATOR.compare(a, b)
}

function compareAny(a: any, b: any): number {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

function isEmptyDf(df: Quiver): boolean {
  return (
    df.data.data.length === 0 &&
    df.index.data[0].length === 0 &&
    df.columns.length === 0
  )
}
