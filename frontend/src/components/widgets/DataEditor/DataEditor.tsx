/**
 * @license
 * Copyright 2018-2021 Streamlit Inc.
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

import React, { ReactElement, useState } from "react"
import "react-responsive-carousel/lib/styles/carousel.min.css"

import { DataEditor as DataEditorProto } from "src/autogen/proto"
import { transparentize } from "color2k"
import withFullScreenWrapper from "src/hocs/withFullScreenWrapper"
import { DataType, Quiver } from "src/lib/Quiver"
import { WidgetInfo, WidgetStateManager } from "src/lib/WidgetStateManager"
import styled, { ThemeProvider } from "styled-components"
import {
  DataEditor as GlideDataEditor,
  GridColumn,
  GridCell,
  GridCellKind,
  GridColumnIcon,
  GridSelection,
  isEditableGridCell,
  CompactSelection,
  Rectangle,
  lossyCopyData,
} from "@glideapps/glide-data-grid"
import { useTheme } from "emotion-theming"
import { Theme } from "src/theme"

export interface DataEditorProps {
  element: Quiver
  height?: number
  width: number
  disabled: boolean
  widgetMgr: WidgetStateManager
}

interface DataEditorContainerProps {
  width: number
  height: number
  theme: Theme
}

const MIN_COLUMN_WIDTH = 120
const ROW_HEIGHT = 35

const ResizableDataEditorContainer = styled.div<DataEditorContainerProps>`
  overflow: hidden;
  position: relative;
  resize: vertical;
  min-height: ${3 * ROW_HEIGHT}px;
  width: ${p => p.width}px;
  height: ${p => p.height}px;
  border: 1px solid ${p => p.theme.colors.fadedText05};

  > :first-child {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
  }
`

class ContentCache {
  // column -> row -> value
  private cachedContent: Map<number, Map<number, GridCell>> = new Map()

  get(col: number, row: number): GridCell | undefined {
    const colCache = this.cachedContent.get(col)

    if (colCache === undefined) {
      return undefined
    }

    return colCache.get(row)
  }

  set(col: number, row: number, value: GridCell): void {
    if (this.cachedContent.get(col) === undefined) {
      this.cachedContent.set(col, new Map())
    }

    const rowCache = this.cachedContent.get(col) as Map<number, GridCell>
    rowCache.set(row, value)
  }
}

interface GridColumnWithCellTemplate extends GridColumn {
  getTemplate(): GridCell
}

function getGridColumn(
  columnWithTemplate: GridColumnWithCellTemplate
): GridColumn {
  const { getTemplate, ...rest } = columnWithTemplate

  return rest
}

interface ColumnConfigProps {
  width?: number
  editable?: boolean
  title?: string
  type?: string
}

function getColumns(
  element: Quiver,
  tableWidth: number
): GridColumnWithCellTemplate[] {
  const numberOfColumns = element.columns[0].length

  const {
    editable,
    columns: columnsConfigStr,
  } = element.widget as DataEditorProto

  const columnsConfig = JSON.parse(columnsConfigStr)

  console.log(columnsConfigStr)
  // 50 for 4 length
  // calculate the column widths to max out the space.
  // We need to subtract the left column
  // 26
  const numRows = element.dimensions.rows - 1
  let calculatedColumnWidth =
    (tableWidth - (22 + `${numRows}`.length * 6)) / numberOfColumns
  if (calculatedColumnWidth < MIN_COLUMN_WIDTH) {
    calculatedColumnWidth = MIN_COLUMN_WIDTH
  }

  // calculate the width used for all columns
  const columns = []
  for (let i = 0; i < numberOfColumns; i++) {
    let dataType = Quiver.getTypeName(element.types.data[i])
    let columnWidth = calculatedColumnWidth
    let isColumnEditable = true
    if (editable === false) {
      isColumnEditable = false
    }
    let columnTitle = element.columns[0][i]
    let columnConfig = {}

    if ("*" in columnsConfig) {
      columnConfig = {
        ...columnConfig,
        ...columnsConfig["*"],
      }
    }

    if (i.toString() in columnsConfig) {
      columnConfig = {
        ...columnConfig,
        ...columnsConfig[i.toString()],
      }
    }

    // Column title takes highest priority
    if (columnTitle in columnsConfig) {
      columnConfig = {
        ...columnConfig,
        ...columnsConfig[columnTitle],
      }
    }

    if (Object.keys(columnConfig).length > 0) {
      if ((columnConfig as ColumnConfigProps).title !== undefined) {
        columnTitle = (columnConfig as ColumnConfigProps).title as string
      }

      if ((columnConfig as ColumnConfigProps).width !== undefined) {
        columnWidth = (columnConfig as ColumnConfigProps).width as number
      }

      // Only update if it is still editable -> editable parameter of widget should have highest prio
      if (
        isColumnEditable &&
        (columnConfig as ColumnConfigProps).editable !== undefined
      ) {
        isColumnEditable = (columnConfig as ColumnConfigProps)
          .editable as boolean
      }

      if ((columnConfig as ColumnConfigProps).type !== undefined) {
        dataType = (columnConfig as ColumnConfigProps).type as string
      }
    }

    let headerIcon = GridColumnIcon.HeaderString

    let emptyCellTemplate = {}

    if (["bool", "boolean"].includes(dataType)) {
      headerIcon = GridColumnIcon.HeaderBoolean

      emptyCellTemplate = {
        kind: GridCellKind.Boolean,
        data: false,
        showUnchecked: true,
        allowEdit: isColumnEditable,
        allowOverlay: false, // no overlay possible
      }
    } else if (
      ["int64", "float64", "int", "float", "number"].includes(dataType)
    ) {
      headerIcon = GridColumnIcon.HeaderNumber

      emptyCellTemplate = {
        kind: GridCellKind.Number,
        data: undefined,
        displayData: "",
        readonly: isColumnEditable === false,
        allowOverlay: true,
      }
    } else if (["unicode", "string", "text"].includes(dataType)) {
      headerIcon = GridColumnIcon.HeaderString

      emptyCellTemplate = {
        kind: GridCellKind.Text,
        data: "",
        displayData: "",
        allowOverlay: true,
        readonly: isColumnEditable === false,
      }
    } else if (["url", "uri"].includes(dataType)) {
      headerIcon = GridColumnIcon.HeaderUri

      emptyCellTemplate = {
        kind: GridCellKind.Uri,
        data: "",
        allowOverlay: true,
        readonly: isColumnEditable === false,
      }
    } else if (["image"].includes(dataType)) {
      // TODO: Allow edits?
      headerIcon = GridColumnIcon.HeaderImage

      emptyCellTemplate = {
        kind: GridCellKind.Image,
        data: [],
        allowAdd: false,
        allowOverlay: true,
      }
    } else if (["markdown"].includes(dataType)) {
      headerIcon = GridColumnIcon.HeaderMarkdown

      emptyCellTemplate = {
        kind: GridCellKind.Markdown,
        data: "",
        readOnly: isColumnEditable === false,
        allowOverlay: true,
      }
    } else if (["id", "identifier"].includes(dataType)) {
      headerIcon = GridColumnIcon.HeaderRowID

      emptyCellTemplate = {
        kind: GridCellKind.RowID,
        data: "",
        allowOverlay: true,
      }
    } else if (dataType.startsWith("list")) {
      headerIcon = GridColumnIcon.HeaderArray

      emptyCellTemplate = {
        kind: GridCellKind.Bubble,
        data: [],
        allowOverlay: true,
      }
    } else {
      if (dataType === "time") {
        headerIcon = GridColumnIcon.HeaderTime
      } else if (dataType === "datetime" || dataType === "date") {
        headerIcon = GridColumnIcon.HeaderDate
      } else {
        // Fallback to string
        headerIcon = GridColumnIcon.HeaderString
      }

      // readonly fallback to text
      emptyCellTemplate = {
        kind: GridCellKind.Text,
        data: "",
        displayData: "",
        allowOverlay: true,
        readonly: true,
      }
    }

    columns.push({
      title: columnTitle,
      width: columnWidth,
      icon: headerIcon,
      hasMenu: true,
      getTemplate: () => {
        return emptyCellTemplate
      },
    } as GridColumnWithCellTemplate)
  }
  return columns
}

function useDataFunctions(
  element: Quiver,
  updateCount: number,
  tableWidth: number
) {
  const cache = React.useRef<ContentCache>(new ContentCache())
  const [colsMap, setColsMap] = React.useState(() =>
    getColumns(element, tableWidth)
  )

  const onColumnResized = React.useCallback(
    (column: GridColumn, newSize: number) => {
      setColsMap(prevColsMap => {
        const index = prevColsMap.findIndex(ci => ci.title === column.title)
        const newArray = [...prevColsMap]
        newArray.splice(index, 1, {
          ...prevColsMap[index],
          width: newSize,
        })
        return newArray
      })
    },
    []
  )

  const cols = React.useMemo(() => {
    return colsMap.map(getGridColumn)
  }, [colsMap])

  const getCellContent = React.useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      let val = cache.current.get(col, row)
      if (val === undefined) {
        // Quiver has the index in 1 column and the header in firs row
        try {
          const cell = element.getCell(row + 1, col + 1)
          val = colsMap[col].getTemplate()

          if (val.kind === GridCellKind.Boolean) {
            val = {
              ...val,
              data: cell.content as boolean,
            }
          } else if (val.kind === GridCellKind.Number) {
            const formattedContents =
              cell.displayContent ||
              Quiver.format(cell.content, cell.contentType)
            let data = cell.content
            if (data instanceof Int32Array) {
              // eslint-disable-next-line prefer-destructuring
              data = (cell.content as Int32Array)[0]
            }

            val = {
              ...val,
              data: data as number,
              displayData: formattedContents,
            }
          } else if (
            val.kind === GridCellKind.Markdown ||
            val.kind === GridCellKind.Uri
          ) {
            val = {
              ...val,
              data: cell.content as string,
            }
          } else if (val.kind === GridCellKind.Text) {
            const formattedContents =
              cell.displayContent ||
              Quiver.format(cell.content, cell.contentType)
            val = {
              ...val,
              data:
                typeof cell.content === "string"
                  ? cell.content
                  : formattedContents,
              displayData: formattedContents,
            }
          } else if (val.kind === GridCellKind.Image) {
            // TODO: check if correct URLs
            val = {
              ...val,
              data:
                cell.content !== undefined && cell.content !== null
                  ? [cell.content.toString()]
                  : [],
            }
          } else if (val.kind === GridCellKind.Bubble) {
            val = {
              ...val,
              data:
                cell.content !== undefined && cell.content !== null
                  ? JSON.parse(JSON.stringify(cell.content))
                  : [],
            }
          } else if (val.kind === GridCellKind.RowID) {
            val = {
              ...val,
              data:
                cell.content !== undefined && cell.content !== null
                  ? cell.content.toString()
                  : "",
            }
          } else {
            console.log("Unknown data type: ", val)
          }
        } catch (exception_var) {
          val = colsMap[col].getTemplate()

          cache.current.set(col, row, val)
        }
      }

      return val
    },
    [colsMap, updateCount]
  )

  const setCellValueRaw = React.useCallback(
    ([col, row]: readonly [number, number], val: GridCell): void => {
      cache.current.set(col, row, val)
    },
    [updateCount]
  )

  const setCellValue = React.useCallback(
    ([col, row]: readonly [number, number], val: GridCell): void => {
      const current = getCellContent([col, row])

      if (isEditableGridCell(val) && isEditableGridCell(current)) {
        const copied = lossyCopyData(val, current)

        let formattedContents = ""
        // TODO: check if type is compatible with DataType instead
        if (
          typeof val.data === "string" ||
          typeof val.data === "number" ||
          typeof val.data === "boolean"
        ) {
          formattedContents = Quiver.format(
            val.data as DataType,
            element.types.data[col]
          )
        } else if (val.data !== undefined && val.data !== null) {
          formattedContents = val.data.toString()
        }

        cache.current.set(col, row, {
          ...copied,
          data: val.data,
          displayData: formattedContents,
          lastUpdated: performance.now(),
        } as any)
      }
    },
    [colsMap, updateCount]
  )

  const getCellsForSelection = React.useCallback(
    (selection: Rectangle): readonly (readonly GridCell[])[] => {
      const result: GridCell[][] = []

      for (let { y } = selection; y < selection.y + selection.height; y++) {
        const row: GridCell[] = []
        for (let { x } = selection; x < selection.x + selection.width; x++) {
          row.push(getCellContent([x, y]))
        }
        result.push(row)
      }

      return result
    },
    [getCellContent]
  )

  return {
    cols,
    getCellContent,
    onColumnResized,
    setCellValue,
    setCellValueRaw,
    getCellsForSelection,
  }
}

function getCurrentState(element: Quiver, widgetMgr: WidgetStateManager): any {
  let currentState
  const currentStateString = widgetMgr.getJsonValue(
    element.widget as WidgetInfo
  )

  if (currentStateString !== undefined) {
    currentState = JSON.parse(currentStateString)
  }

  if (currentState === undefined) {
    currentState = {
      edits: {},
      selections: [],
    }
  }

  if (currentState.edits === undefined) {
    currentState.edits = {}
  }

  if (currentState.selections === undefined) {
    currentState.selections = {}
  }
  return currentState
}

function useEventListener<K extends keyof HTMLElementEventMap>(
  eventName: K,
  handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  element: HTMLElement | Window | null,
  passive: boolean,
  capture?: boolean
) {
  capture = capture ?? false
  // Create a ref that stores handler
  const savedHandler = React.useRef<
    (this: HTMLElement, ev: HTMLElementEventMap[K]) => any
  >()

  // Update ref.current value if handler changes.
  // This allows our effect below to always get latest handler ...
  // ... without us needing to pass it in effect deps array ...
  // ... and potentially cause effect to re-run every render.
  savedHandler.current = handler
  React.useEffect(
    () => {
      // Make sure element supports addEventListener
      if (element === null || element.addEventListener === undefined) return
      const el = element as HTMLElement

      // Create event listener that calls handler function stored in ref
      const eventListener = (event: HTMLElementEventMap[K]): void => {
        savedHandler.current?.call(el, event)
      }

      el.addEventListener(eventName, eventListener, { passive, capture })

      // Remove event listener on cleanup
      // eslint-disable-next-line consistent-return
      return () => {
        el.removeEventListener(eventName, eventListener, { capture })
      }
    },
    [eventName, element, passive, capture] // Re-run if eventName or element changes
  )
}

/**
 * Functional element representing a DataFrame.
 */
export function DataEditor({
  element,
  height: propHeight,
  width,
  disabled,
  widgetMgr,
}: DataEditorProps): ReactElement {
  const theme: Theme = useTheme()

  const [numRows, setNumRows] = useState(element.dimensions.rows - 1)
  const [updateCount, setUpdateCount] = useState(0)
  const [gridSelection, setGridSelection] = useState<
    GridSelection | undefined
  >(undefined)
  const [selectedRows, setSelectedRows] = React.useState(
    CompactSelection.empty()
  )
  const [selectedColumns, setSelectedColumns] = React.useState(
    CompactSelection.empty()
  )

  const {
    cols,
    getCellContent,
    onColumnResized,
    setCellValue,
    setCellValueRaw,
    getCellsForSelection,
  } = useDataFunctions(element, updateCount, width)

  const [showSearch, setShowSearch] = useState(false)

  // numRows +2 because of header and footer, and +2 to total because of border?
  const height = propHeight || Math.min((numRows + 2) * ROW_HEIGHT + 2, 400)
  console.log((element.widget as WidgetInfo).id)

  useEventListener(
    "keydown",
    React.useCallback(event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        setShowSearch(cv => !cv)
        event.stopPropagation()
        event.preventDefault()
      }
      if (event.key === "Escape") {
        // TODO: workaround to reset selection
        // Since all selection callbacks are fired, we cannot easily reset the state with those callbacks
        console.log("Escape pressed")
        const currentState = getCurrentState(element, widgetMgr)
        if (
          currentState.selections !== undefined &&
          currentState.selections.length > 0
        ) {
          currentState.selections = []
          widgetMgr.setJsonValue(
            element.widget as WidgetInfo,
            currentState,
            { fromUi: true },
            false
          )
        }
      }
    }, []),
    window,
    false,
    true
  )

  const onRowAppended = React.useCallback(() => {
    const newRow = numRows
    for (let col = 0; col < cols.length; col++) {
      const cell = getCellContent([col, newRow])
      setCellValueRaw([col, newRow], cell)
    }
    setNumRows(cv => cv + 1)
  }, [getCellContent, numRows, setCellValueRaw])

  // Put it all together.
  return (
    <ThemeProvider
      theme={{
        accentColor: theme.colors.primary,
        accentLight: transparentize(theme.colors.primary, 0.9),

        textDark: theme.colors.bodyText,
        textMedium: theme.colors.fadedText60,
        textLight: theme.colors.fadedText40,
        textBubble: theme.colors.fadedText60,

        bgIconHeader: theme.colors.fadedText60,
        fgIconHeader: theme.colors.white,
        textHeader: theme.colors.fadedText60,
        textHeaderSelected: theme.colors.white,

        bgCell: theme.colors.bgColor,
        bgCellMedium: "#00FF00",
        bgHeader: theme.colors.bgMix,
        bgHeaderHasFocus: theme.colors.secondaryBg,
        bgHeaderHovered: transparentize(theme.colors.primary, 0.8),

        bgBubble: theme.colors.secondaryBg,
        bgBubbleSelected: theme.colors.secondaryBg,

        bgSearchResult: transparentize(theme.colors.primary, 0.9),

        borderColor: theme.colors.fadedText05,
        drilldownBorder: "#00FF00",

        linkColor: theme.colors.linkText,

        headerFontStyle: `bold ${theme.fontSizes.sm}`,
        baseFontStyle: theme.fontSizes.sm,

        fontFamily: theme.fonts.sansSerif,
      }}
    >
      <ResizableDataEditorContainer
        className="stDataEditor"
        width={width}
        height={height}
        theme={theme}
      >
        <GlideDataEditor
          gridSelection={gridSelection}
          getCellContent={getCellContent}
          columns={cols}
          rows={numRows}
          rowHeight={ROW_HEIGHT}
          maxColumnWidth={1000}
          verticalBorder={true} // border between cells
          smoothScrollX={true} // false?
          smoothScrollY={true} // false?
          // Activate search:
          showSearch={showSearch}
          onSearchClose={() => setShowSearch(false)}
          // Activate copy & paste:
          onPaste={(element.widget as DataEditorProto).editable === true}
          getCellsForSelection={getCellsForSelection}
          // Add rows capabilities:
          onRowAppended={
            (element.widget as DataEditorProto).editable === true
              ? onRowAppended
              : undefined
          }
          trailingRowOptions={
            (element.widget as DataEditorProto).editable === true
              ? {
                  hint: "New row",
                  sticky: true,
                  tint: true,
                }
              : undefined
          }
          rowMarkers={
            (element.widget as DataEditorProto).rowSelectionMode ===
            DataEditorProto.SelectionMode.DEACTIVATED
              ? "number"
              : "both"
          }
          rowSelectionMode={"auto"}
          onColumnResized={onColumnResized}
          selectedRows={selectedRows}
          onSelectedRowsChange={(newRows: CompactSelection) => {
            if (
              (element.widget as DataEditorProto).rowSelectionMode ===
              DataEditorProto.SelectionMode.DEACTIVATED
            ) {
              console.log("Row selection deactivated")
              return
            }

            if (JSON.stringify(selectedRows) === JSON.stringify(newRows)) {
              console.log("Row selected: nothing changed")
              // nothing changed, so don't update the state
              // this callback is also triggered when the colum selection is changed
              return
            }

            console.log("Row selection changed")
            setSelectedRows(newRows)
            const currentState = getCurrentState(element, widgetMgr)
            currentState.selections = []
            for (const selection of Array.from(newRows)) {
              currentState.selections.push(`:${selection}`)
            }

            // only send value if changes actually happend and if the selection is not empty
            if (
              currentState.selections.length > 0 &&
              JSON.stringify(currentState) !==
                JSON.stringify(getCurrentState(element, widgetMgr))
            ) {
              widgetMgr.setJsonValue(
                element.widget as WidgetInfo,
                currentState,
                { fromUi: true },
                false
              )
            }
          }}
          selectedColumns={selectedColumns}
          onSelectedColumnsChange={(newColumns: CompactSelection, trigger) => {
            console.log(gridSelection)
            console.log(selectedRows)
            console.log(newColumns)
            if (
              (element.widget as DataEditorProto).columnSelectionMode ===
              DataEditorProto.SelectionMode.DEACTIVATED
            ) {
              console.log("Column selection deactivated")
              return
            }
            if (
              JSON.stringify(selectedColumns) === JSON.stringify(newColumns)
            ) {
              console.log("Col Selected: nothing changed")
              // nothing changed, so don't update the state
              // this callback is also triggered when the row selection is changed
              return
            }

            console.log("Column selection changed")
            setSelectedColumns(newColumns)
            const currentState = getCurrentState(element, widgetMgr)
            currentState.selections = []
            for (const selection of Array.from(newColumns)) {
              currentState.selections.push(`${selection}:`)
            }

            // only send value if changes actually happend and if the selection is not empty
            if (
              currentState.selections.length > 0 &&
              JSON.stringify(currentState) !==
                JSON.stringify(getCurrentState(element, widgetMgr))
            ) {
              widgetMgr.setJsonValue(
                element.widget as WidgetInfo,
                currentState,
                { fromUi: true },
                false
              )
            }
          }}
          onGridSelectionChange={(newVal: GridSelection | undefined) => {
            console.log("GRID selection changed", newVal)
            setGridSelection(newVal)

            if (
              (element.widget as DataEditorProto).cellSelectionMode ===
              DataEditorProto.SelectionMode.DEACTIVATED
            ) {
              console.log("Cell selection deactivated")
              return
            }

            const currentState = getCurrentState(element, widgetMgr)
            currentState.selections = []

            if (newVal !== undefined && newVal.cell[0] !== -1) {
              // undefined happens if it gets unselected
              // -1 happens if the index row gets selected
              currentState.selections.push(
                `${newVal.cell[0]}:${newVal.cell[1]}`
              )
            }

            // only send value if changes actually happend and if the selection is not empty
            if (
              currentState.selections.length > 0 &&
              JSON.stringify(currentState) !==
                JSON.stringify(getCurrentState(element, widgetMgr))
            ) {
              widgetMgr.setJsonValue(
                element.widget as WidgetInfo,
                currentState,
                { fromUi: true },
                false
              )
            }
          }}
          onCellClicked={(cell: readonly [number, number]) => {
            console.log(cell)
          }}
          onCellEdited={(
            [col, row]: readonly [number, number],
            val: GridCell
          ): void => {
            if ((element.widget as DataEditorProto).editable === false) {
              console.log("Cell editing is deactivated")
              return
            }

            setCellValue([col, row], val)
            setUpdateCount(updateCount + 1)
            if (
              val.kind === GridCellKind.Text ||
              val.kind === GridCellKind.Number ||
              val.kind === GridCellKind.Boolean
            ) {
              const cellPosition = `${col}:${row}`
              const currentState = getCurrentState(element, widgetMgr)
              currentState.edits[cellPosition] = val.data

              // only send value if changes actually happend
              if (
                JSON.stringify(currentState) !==
                JSON.stringify(getCurrentState(element, widgetMgr))
              ) {
                widgetMgr.setJsonValue(
                  element.widget as WidgetInfo,
                  currentState,
                  { fromUi: true },
                  false
                )
              }
            }
          }}
          // onDeleteRows={() => undefined}: onDeleteRows is called when the user deletes one or more rows. rows is an array with the absolute indexes of the deletes rows. Note that it is on you to actually effect the deletion of those rows.
          // isDraggable={true}
          // onRowMoved={() => undefined} // Called whenever a row re-order operation is completed. Setting the callback enables re-ordering by dragging the first column of a row.
          // rowMarkerWidth: is the width of the marker column on the very left. By default it adapts based on the number of rows in your data set.
          // onColumnMoved: onColumnMoved is called when the user finishes moving a column
        />
      </ResizableDataEditorContainer>
    </ThemeProvider>
  )
}

export default withFullScreenWrapper(DataEditor)
