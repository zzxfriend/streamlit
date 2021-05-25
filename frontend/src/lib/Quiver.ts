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

import { ArrowNamedDataSet } from "src/autogen/proto"
import {
  concatTables,
  Styler,
  parseTable,
  DataFrame,
  compareValues,
} from "src/lib/arrowProto"
import { betaToFormattedString } from "src/lib/format"

interface TableDimensions {
  headerRows: number
  headerColumns: number
  dataRows: number
  dataColumns: number
  rows: number
  columns: number
}

export type TableCellType = "blank" | "index" | "columns" | "data"

interface TableCell {
  type: TableCellType
  id?: string
  classNames: string
  content: string
}

export interface Index {
  data: string[][]
  type: IndexType[]
}

export interface IndexType {
  name: string
  meta: any
}

export type Columns = string[][]

export interface Data {
  data: any[][]
  type: string[]
}

export class Quiver {
  public index: Index

  public columns: Columns

  public data: Data

  public styler?: Styler

  constructor(df: DataFrame) {
    const { index, columns, data, styler } = df

    this.index = index
    this.columns = columns
    this.data = data
    this.styler = styler
  }

  get tableId(): string | undefined {
    return this.styler?.uuid && `T_${this.styler.uuid}`
  }

  get tableStyles(): string | undefined {
    return this.styler?.styles
  }

  get caption(): string | undefined {
    return this.styler?.caption
  }

  get dimensions(): TableDimensions {
    const [headerColumns, dataRowsCheck] = this.index.data.length
      ? [this.index.data.length, this.index.data[0].length]
      : [0, 0]

    const [headerRows, dataColumnsCheck] = this.columns.length
      ? [this.columns.length, this.columns[0].length]
      : [1, 0]

    const [dataRows, dataColumns] = this.data.data.length
      ? [this.data.data.length, this.data.data[0].length]
      : // If there is no data, default to the number of header columns.
        [0, dataColumnsCheck]

    if (
      (dataRows !== 0 && dataRows !== dataRowsCheck) ||
      (dataColumns !== 0 && dataColumns !== dataColumnsCheck)
    ) {
      throw new Error(
        "Dataframe dimensions don't align: " +
          `rows(${dataRows} != ${dataRowsCheck}) OR ` +
          `cols(${dataColumns} != ${dataColumnsCheck})`
      )
    }

    const rows = headerRows + dataRows
    const columns = headerColumns + dataColumns

    return {
      headerRows,
      headerColumns,
      dataRows,
      dataColumns,
      rows,
      columns,
    }
  }

  public getCell(rowIndex: number, columnIndex: number): TableCell {
    const { headerRows, headerColumns, rows, columns } = this.dimensions

    if (rowIndex < 0 || rowIndex >= rows) {
      throw new Error("Row index is out of range.")
    }
    if (columnIndex < 0 || columnIndex >= columns) {
      throw new Error("Column index is out of range.")
    }

    const isBlankCell = rowIndex < headerRows && columnIndex < headerColumns
    const isIndexCell = rowIndex >= headerRows && columnIndex < headerColumns
    const isColumnsCell = rowIndex < headerRows && columnIndex >= headerColumns

    if (isBlankCell) {
      const classNames = ["blank"]
      if (columnIndex > 0) {
        classNames.push(`level${rowIndex}`)
      }
      return {
        type: "blank",
        classNames: classNames.join(" "),
        content: "",
      }
    }

    if (isIndexCell) {
      const dataRowIndex = rowIndex - headerRows

      const uuid = this.styler?.uuid
      const classNames = [
        `row_heading`,
        `level${columnIndex}`,
        `row${dataRowIndex}`,
      ]
      const contentType = this.index.type[columnIndex].name

      return {
        type: "index",
        id: uuid
          ? `T_${uuid}level${columnIndex}_row${dataRowIndex}`
          : undefined,
        classNames: classNames.join(" "),
        // Table index is stored as is (in the column format).
        content: betaToFormattedString(
          this.index.data[columnIndex][dataRowIndex],
          contentType
        ),
      }
    }

    if (isColumnsCell) {
      const dataColumnIndex = columnIndex - headerColumns

      const classNames = [
        `col_heading`,
        `level${rowIndex}`,
        `col${dataColumnIndex}`,
      ]

      return {
        type: "columns",
        classNames: classNames.join(" "),
        content: this.columns[rowIndex][dataColumnIndex],
      }
    }

    const dataRowIndex = rowIndex - headerRows
    const dataColumnIndex = columnIndex - headerColumns

    const uuid = this.styler?.uuid
    const classNames = ["data", `row${dataRowIndex}`, `col${dataColumnIndex}`]
    const contentType = this.data.type[dataColumnIndex]
    const content = this.styler?.displayValues
      ? this.styler.displayValues.getCell(rowIndex, columnIndex).content
      : betaToFormattedString(
          this.data.data[dataRowIndex][dataColumnIndex],
          contentType
        )

    return {
      type: "data",
      id: uuid
        ? `T_${uuid}row${dataRowIndex}_col${dataColumnIndex}`
        : undefined,
      classNames: classNames.join(" "),
      content,
    }
  }

  public getSortedDataRowIndices(
    sortColumnIdx: number,
    sortAscending: boolean
  ): any[] {
    const [dataRows, dataColumns] = this.tableRowsAndColumns
    if (sortColumnIdx < 0 || sortColumnIdx >= dataColumns) {
      throw new Error(
        `Bad sortColumnIdx ${sortColumnIdx} (should be >= 0, < ${dataColumns})`
      )
    }

    const sortColumnType = this.data.type[sortColumnIdx]

    const indices = new Array(dataRows)
    for (let i = 0; i < dataRows; i += 1) {
      indices[i] = i
    }
    indices.sort((aRowIdx, bRowIdx) => {
      const aValue = this.data.data[aRowIdx][sortColumnIdx]
      const bValue = this.data.data[bRowIdx][sortColumnIdx]
      return sortAscending
        ? compareValues(aValue, bValue, sortColumnType)
        : compareValues(bValue, aValue, sortColumnType)
    })

    return indices
  }

  public get tableRowsAndColumns(): number[] {
    if (!this.data.data || !this.data.data[0]) {
      return [0, 0]
    }

    const cols = this.data.data[0].length
    if (cols === 0) {
      return [0, 0]
    }
    const rows = this.data.data.length
    return [rows, cols]
  }

  public addRows(newRows: Quiver): void {
    const { index, data, columns, styler } = concatTables(this, newRows)

    this.index = index
    this.data = data
    this.columns = columns
    this.styler = styler
  }
}

export function betaAddRows(
  element: any,
  namedDataSet: ArrowNamedDataSet
): any {
  const name = namedDataSet.hasName ? namedDataSet.name : null
  const newRows = namedDataSet.data
  const namedDataSets = getNamedDataSets(element)
  const [existingDatasetIndex, existingDataSet] = getNamedDataSet(
    namedDataSets,
    name
  )

  let dataframeToModify

  // There are 5 cases to consider:
  // 1. add_rows has a named dataset
  //   a) element has a named dataset with that name -> use that one
  //   b) element has no named dataset with that name -> put the new dataset into the element
  // 2. add_rows as an unnamed dataset
  //   a) element has an unnamed dataset -> use that one
  //   b) element has only named datasets -> use the first named dataset
  //   c) element has no dataset -> put the new dataset into the element
  if (namedDataSet.hasName) {
    if (existingDataSet) {
      dataframeToModify = existingDataSet.data
    } else {
      return pushNamedDataSet(element, namedDataSet)
    }
  } else {
    const existingDataFrame =
      element instanceof Quiver ? element : element.data
    if (existingDataFrame) {
      dataframeToModify = existingDataFrame
    } else if (existingDataSet) {
      dataframeToModify = existingDataSet.data
    } else {
      const newDf = parseTable(newRows)
      const newQuiver = new Quiver(newDf)
      element.addRows(newQuiver)

      return element
    }
  }

  const newDf = parseTable(newRows)
  const newQuiver = new Quiver(newDf)

  dataframeToModify.addRows(newQuiver)

  if (existingDataSet) {
    return setDataFrameInNamedDataSet(
      element,
      existingDatasetIndex,
      dataframeToModify
    )
  }

  return dataframeToModify
}

function setDataFrameInNamedDataSet(element: any, index: any, df: any): any {
  return {
    ...element,
    datasets: [
      {
        ...element.datasets[index],
        data: df,
      },
    ],
  }
}

function getNamedDataSets(element: any): any {
  return element?.datasets ? element.datasets : null
}

function getNamedDataSet(namedDataSets: any, name: any): any {
  if (namedDataSets != null) {
    if (namedDataSets.length === 1) {
      const firstNamedDataSet = namedDataSets[0]
      return [0, firstNamedDataSet]
    }

    const namedDataSetEntry = namedDataSets.find(
      (ds: any) => ds.hasName && ds.name === name
    )

    if (namedDataSetEntry) {
      return namedDataSetEntry
    }
  }

  return [-1, null]
}

function pushNamedDataSet(element: any, namedDataset: any): any {
  element.datasets.push(namedDataset)
  return element
}
