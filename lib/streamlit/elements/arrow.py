# Copyright 2018-2021 Streamlit Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import inspect
import json
from collections import namedtuple
from collections.abc import Iterable
from typing import Any, Callable, Dict, List, Optional, Union, cast, get_type_hints

import pyarrow as pa
from numpy import ndarray
from pandas import DataFrame
from pandas.io.formats.style import Styler
from streamlit.proto.Arrow_pb2 import Arrow as ArrowProto
from streamlit.proto.DataEditor_pb2 import DataEditor as DataEditorProto
from streamlit.proto.InteractiveDataframe_pb2 import (
    InteractiveDataframe as InteractiveDataframeProto,
)
from streamlit.script_run_context import ScriptRunContext, get_script_run_ctx
from streamlit.state.session_state import (
    WidgetArgs,
    WidgetCallback,
    WidgetKwargs,
    get_session_state,
)
from streamlit.state.widgets import _get_widget_id, register_widget
from streamlit.type_util import Key, to_key

import streamlit
from streamlit import type_util

from .form import current_form_id

Data = Optional[
    Union[DataFrame, Styler, pa.Table, ndarray, Iterable, Dict[str, List[Any]]]
]

Cell = namedtuple("Cell", "row column value")
Row = namedtuple("Row", "row value")
Column = namedtuple("Column", "column name value")

from dataclasses import dataclass
from enum import Enum


def _configure_column(
    title: Optional[str] = None,
    width: Optional[int] = None,
    editable: Optional[bool] = None,
    type: Optional[str] = None,
) -> Dict[str, Any]:
    """Configure a data editor column.

    Parameters
    ----------
    title : Optional[str]
        The column title.

    width : Optional[int]
        The column initial width.

    editable : Optional[bool]
        Whether the cells in the column are editable.

    type : ptional[str]
        The data type of the column. Type must be one of:
        int, float, string, text, datetime, time, date, boolean, id, markdown, image, url, uri.

    """

    column_config = {}

    if title:
        if title.isnumeric():
            raise ValueError("title cannot be numeric.")

        column_config["title"] = title

    if width is not None:
        if width < 25:
            raise ValueError("width must be at least 25.")

        column_config["width"] = width

    if editable is not None:
        column_config["editable"] = editable

    if type is not None:
        if type not in [
            "int",
            "float",
            "string",
            "text",
            "datetime",
            "time",
            "date",
            "boolean",
            "id",
            "markdown",
            "image",
            "url",
            "uri",
        ]:
            raise ValueError(
                "type must be one of: int, float, string, text, datetime, time, date, boolean, id, markdown, image, url, uri"
            )
        column_config["type"] = type

    return column_config


class ArrowMixin:
    def _arrow_dataframe(
        self,
        data: Data = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> "streamlit.delta_generator.DeltaGenerator":
        """Display a dataframe as an interactive table.
        Parameters
        ----------
        data : pandas.DataFrame, pandas.Styler, pyarrow.Table, numpy.ndarray, Iterable, dict, or None
            The data to display.
            If 'data' is a pandas.Styler, it will be used to style its
            underyling DataFrame.
        width : int or None
            Desired width of the UI element expressed in pixels. If None, a
            default width based on the page width is used.
        height : int or None
            Desired height of the UI element expressed in pixels. If None, a
            default height is used.
        Examples
        --------
        >>> df = pd.DataFrame(
        ...    np.random.randn(50, 20),
        ...    columns=('col %d' % i for i in range(20)))
        ...
        >>> st._arrow_dataframe(df)
        >>> st._arrow_dataframe(df, 200, 100)
        You can also pass a Pandas Styler object to change the style of
        the rendered DataFrame:
        >>> df = pd.DataFrame(
        ...    np.random.randn(10, 20),
        ...    columns=('col %d' % i for i in range(20)))
        ...
        >>> st._arrow_dataframe(df.style.highlight_max(axis=0))
        """
        # If pandas.Styler uuid is not provided, a hash of the position
        # of the element will be used. This will cause a rerender of the table
        # when the position of the element is changed.
        delta_path = self.dg._get_delta_path_str()
        default_uuid = str(hash(delta_path))

        proto = ArrowProto()
        marshall(proto, data, default_uuid)
        return cast(
            "streamlit.delta_generator.DeltaGenerator",
            self.dg._enqueue(
                "arrow_data_frame", proto, element_width=width, element_height=height
            ),
        )

    def _arrow_interactive_dataframe(
        self,
        data: Data = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        key: Optional[Key] = None,
        on_click: Optional[Union[WidgetCallback, bool]] = None,
        on_select: Optional[Union[WidgetCallback, bool]] = None,
        args: Optional[WidgetArgs] = None,
        kwargs: Optional[WidgetKwargs] = None,
    ) -> "streamlit.delta_generator.DeltaGenerator":
        if on_click is None and on_select is None:
            return self._arrow_dataframe(data, width, height)

        # If pandas.Styler uuid is not provided, a hash of the position
        # of the element will be used. This will cause a rerender of the table
        # when the position of the element is changed.
        delta_path = self.dg._get_delta_path_str()
        default_uuid = str(hash(delta_path))

        data_editor_proto = DataEditorProto()
        data_editor_proto.disabled = False
        data_editor_proto.editable = False
        data_editor_proto.form_id = current_form_id(self.dg)
        data_editor_proto.columns = "{}"
        data_editor_proto.column_selection_mode = (
            DataEditorProto.SelectionMode.DEACTIVATED
        )
        data_editor_proto.row_selection_mode = DataEditorProto.SelectionMode.DEACTIVATED
        if on_click or on_select:
            data_editor_proto.cell_selection_mode = DataEditorProto.SelectionMode.SINGLE
        else:
            data_editor_proto.cell_selection_mode = (
                DataEditorProto.SelectionMode.DEACTIVATED
            )

        marshall(data_editor_proto, data, default_uuid)

        session_state = get_session_state()
        if on_click and not on_select:
            # On click events should only be removed from session state for next reload
            session_state[to_key(key)] = None

        old_state = None
        widget_id = _get_widget_id(
            "data_editor", data_editor_proto, None
        )  # TODO: never use widget key here
        if widget_id in session_state._old_state:
            old_state = session_state._old_state[widget_id]

        def deserialize_data_editor_event(ui_value, widget_id=""):
            if ui_value is None:
                return {}
            if isinstance(ui_value, str):
                return json.loads(ui_value)

            return ui_value

        def serialize_data_editor_event(v):
            return json.dumps(v, default=str)

        current_value, _ = register_widget(
            "data_editor",
            data_editor_proto,
            user_key=None,  # TODO: Never use widget key here
            on_change_handler=None,
            args=args,
            kwargs=kwargs,
            deserializer=deserialize_data_editor_event,
            serializer=serialize_data_editor_event,
            ctx=get_script_run_ctx(),
        )

        if on_click or on_select:
            new_selections = None
            old_selections = None

            if current_value is not None and "selections" in current_value:
                new_selections = current_value["selections"]

            if old_state is not None and "selections" in old_state:
                old_selections = old_state["selections"]

            if new_selections is not None and new_selections != old_selections:
                if not isinstance(data, DataFrame):
                    data = type_util.convert_anything_to_df(data)

                # changes in selection
                for selection in new_selections:
                    col, row = selection.split(":")
                    if not col or not row:
                        # Not a cell selection
                        continue
                    col, row = int(col), int(row)

                    if col is not None and row is not None:
                        if row + 1 <= data.shape[0] and col + 1 <= data.shape[1]:
                            value = data.iloc[row, col]
                            if hasattr(value, "item"):
                                value = value.item()

                            if to_key(key) is not None:
                                session_state[to_key(key)] = Cell(row, col, value)

                            args = args or ()
                            kwargs = kwargs or {}

                            if callable(on_click):
                                on_click(*args, **kwargs)

                            if callable(on_select):
                                on_select(*args, **kwargs)

                            # TODO: only trigger on the first selection
                            break

        return cast(
            "streamlit.delta_generator.DeltaGenerator",
            self.dg._enqueue(
                "data_editor",
                data_editor_proto,
                element_width=width,
                element_height=height,
            ),
        )

    def _arrow_data_editor(
        self,
        data: Data = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        key: Optional[Key] = None,
        args: Optional[WidgetArgs] = None,
        kwargs: Optional[WidgetKwargs] = None,
        on_change: Optional[WidgetCallback] = None,
        # Custom parameters:
        on_selection_change: Optional[Union[Callable, List[Callable]]] = None,
        columns: Optional[Dict[Union[int, str], dict]] = None,
        editable: bool = True,
    ) -> Data:

        if columns is None:
            columns = {}

        if on_selection_change is None:
            on_selection_change = []

        if not isinstance(on_selection_change, list):
            on_selection_change = [on_selection_change]

        single_row_selection_callbacks = []
        multi_row_selection_callbacks = []
        single_column_selection_callbacks = []
        multi_column_selection_callbacks = []
        single_cell_selection_callbacks = []
        multi_cell_selection_callbacks = []

        for selection_callback in on_selection_change:
            # Also use type for selection, via: get_type_hints
            arguments = inspect.getfullargspec(selection_callback).args
            if "cell" in arguments:
                single_cell_selection_callbacks.append(selection_callback)

            if "cells" in arguments:
                multi_cell_selection_callbacks.append(selection_callback)

            if "row" in arguments:
                single_row_selection_callbacks.append(selection_callback)

            if "rows" in arguments:
                multi_row_selection_callbacks.append(selection_callback)

            if "column" in arguments:
                single_column_selection_callbacks.append(selection_callback)

            if "columns" in arguments:
                multi_column_selection_callbacks.append(selection_callback)

            # TODO: warning message if there is a problem

        # If pandas.Styler uuid is not provided, a hash of the position
        # of the element will be used. This will cause a rerender of the table
        # when the position of the element is changed.
        delta_path = self.dg._get_delta_path_str()
        default_uuid = str(hash(delta_path))

        data_editor_proto = DataEditorProto()
        data_editor_proto.disabled = False
        data_editor_proto.editable = editable
        data_editor_proto.form_id = current_form_id(self.dg)
        data_editor_proto.columns = json.dumps(columns)

        # Determine column selection mode
        if len(multi_column_selection_callbacks) > 0:
            data_editor_proto.column_selection_mode = (
                DataEditorProto.SelectionMode.MULTI
            )
        elif len(single_column_selection_callbacks) > 0:
            data_editor_proto.column_selection_mode = (
                DataEditorProto.SelectionMode.SINGLE
            )
        else:
            data_editor_proto.column_selection_mode = (
                DataEditorProto.SelectionMode.DEACTIVATED
            )

        # Determine cell selection mode
        if len(multi_cell_selection_callbacks) > 0:
            data_editor_proto.cell_selection_mode = DataEditorProto.SelectionMode.MULTI
        elif len(single_cell_selection_callbacks) > 0:
            data_editor_proto.cell_selection_mode = DataEditorProto.SelectionMode.SINGLE
        else:
            data_editor_proto.cell_selection_mode = (
                DataEditorProto.SelectionMode.DEACTIVATED
            )

        # Determine row selection mode
        if len(multi_row_selection_callbacks) > 0:
            data_editor_proto.row_selection_mode = DataEditorProto.SelectionMode.MULTI
        elif len(single_row_selection_callbacks) > 0:
            data_editor_proto.row_selection_mode = DataEditorProto.SelectionMode.SINGLE
        else:
            data_editor_proto.row_selection_mode = (
                DataEditorProto.SelectionMode.DEACTIVATED
            )

        marshall(data_editor_proto, data, default_uuid)

        session_state = get_session_state()
        old_state = None
        widget_id = _get_widget_id("data_editor", data_editor_proto, to_key(key))
        if widget_id in session_state._old_state:
            old_state = session_state._old_state[widget_id]

        def deserialize_data_editor_event(ui_value, widget_id=""):
            if ui_value is None:
                return {}
            if isinstance(ui_value, str):
                return json.loads(ui_value)

            return ui_value

        def serialize_data_editor_event(v):
            return json.dumps(v, default=str)

        current_value, _ = register_widget(
            "data_editor",
            data_editor_proto,
            user_key=to_key(key),
            on_change_handler=on_change,
            args=args,
            kwargs=kwargs,
            deserializer=deserialize_data_editor_event,
            serializer=serialize_data_editor_event,
            ctx=get_script_run_ctx(),
        )

        return_value = None
        if not isinstance(data, DataFrame):
            data = type_util.convert_anything_to_df(data)

        new_df = data.copy()
        return_value = new_df
        if current_value and "edits" in current_value:
            for edit in current_value["edits"].keys():
                col, row = edit.split(":")
                col, row = int(col), int(row)
                # TODO: Check cols as well
                if row + 1 > new_df.shape[0]:
                    # it is possible thtat there are multiple rows to add
                    # this happens if mulitple lines are added without edits
                    for row_idx in range(new_df.shape[0], row + 1):
                        # Append new row with empty values
                        # TODO: use iloc? cannot add rows?
                        new_df.loc[row_idx] = [None for _ in range(new_df.shape[1])]
                new_df.iat[row, col] = current_value["edits"][edit]

            return_value = new_df

            if (
                len(multi_row_selection_callbacks) > 0
                or len(single_row_selection_callbacks) > 0
                or len(multi_column_selection_callbacks) > 0
                or len(single_column_selection_callbacks) > 0
                or len(multi_cell_selection_callbacks) > 0
                or len(single_cell_selection_callbacks) > 0
            ):
                new_selections = None
                old_selections = None

                if current_value is not None and "selections" in current_value:
                    new_selections = current_value["selections"]

                if old_state is not None and "selections" in old_state:
                    old_selections = old_state["selections"]

                if new_selections is not None and new_selections != old_selections:
                    column_selection_changes = []
                    row_selection_changes = []
                    cell_selection_changes = []

                    # changes in selection
                    for selection in new_selections:
                        col, row = selection.split(":")
                        if col:
                            col = int(col)
                        else:
                            col = None

                        if row:
                            row = int(row)
                        else:
                            row = None

                        if col is not None and row is not None:
                            if (
                                row + 1 <= new_df.shape[0]
                                and col + 1 <= new_df.shape[1]
                            ):
                                value = new_df.iloc[row, col]
                                if hasattr(value, "item"):
                                    value = value.item()
                                cell_selection_changes.append(Cell(col, row, value))
                        elif col is not None:
                            if col + 1 <= new_df.shape[1]:
                                column_selection_changes.append(
                                    Column(
                                        col, new_df.columns[col], new_df.iloc[:, col]
                                    )
                                )
                        elif row is not None:
                            if row + 1 <= new_df.shape[0]:
                                row_selection_changes.append(Row(row, new_df.iloc[row]))

        self.dg._enqueue(
            "data_editor",
            data_editor_proto,
            element_width=width,
            element_height=height,
        ),
        return return_value

    def _arrow_table(
        self, data: Data = None
    ) -> "streamlit.delta_generator.DeltaGenerator":
        """Display a static table.

        This differs from `st._arrow_dataframe` in that the table in this case is
        static: its entire contents are laid out directly on the page.

        Parameters
        ----------
        data : pandas.DataFrame, pandas.Styler, pyarrow.Table, numpy.ndarray, Iterable, dict, or None
            The table data.

        Example
        -------
        >>> df = pd.DataFrame(
        ...    np.random.randn(10, 5),
        ...    columns=("col %d" % i for i in range(5)))
        ...
        >>> st._arrow_table(df)

        """
        # If pandas.Styler uuid is not provided, a hash of the position
        # of the element will be used. This will cause a rerender of the table
        # when the position of the element is changed.
        delta_path = self.dg._get_delta_path_str()
        default_uuid = str(hash(delta_path))

        proto = ArrowProto()
        marshall(proto, data, default_uuid)
        return cast(
            "streamlit.delta_generator.DeltaGenerator",
            self.dg._enqueue("arrow_table", proto),
        )

    @property
    def dg(self) -> "streamlit.delta_generator.DeltaGenerator":
        """Get our DeltaGenerator."""
        return cast("streamlit.delta_generator.DeltaGenerator", self)


def marshall(
    proto: Union[ArrowProto, InteractiveDataframeProto, DataEditorProto],
    data: Data,
    default_uuid: Optional[str] = None,
) -> None:
    """Marshall pandas.DataFrame into an Arrow proto.

    Parameters
    ----------
    proto : proto.Arrow
        Output. The protobuf for Streamlit Arrow proto.

    data : pandas.DataFrame, pandas.Styler, pyarrow.Table, numpy.ndarray, Iterable, dict, or None
        Something that is or can be converted to a dataframe.

    default_uuid : Optional[str]
        If pandas.Styler UUID is not provided, this value will be used.
        This attribute is optional and only used for pandas.Styler, other elements
        (e.g. charts) can ignore it.

    """
    if type_util.is_pandas_styler(data):
        # default_uuid is a string only if the data is a `Styler`,
        # and `None` otherwise.
        assert isinstance(
            default_uuid, str
        ), "Default UUID must be a string for Styler data."
        _marshall_styler(proto, data, default_uuid)

    if isinstance(data, pa.Table):
        proto.data = type_util.pyarrow_table_to_bytes(data)
    else:
        df = type_util.convert_anything_to_df(data)
        proto.data = type_util.data_frame_to_bytes(df)


def _marshall_styler(proto: ArrowProto, styler: Styler, default_uuid: str) -> None:
    """Marshall pandas.Styler into an Arrow proto.

    Parameters
    ----------
    proto : proto.Arrow
        Output. The protobuf for Streamlit Arrow proto.

    styler : pandas.Styler
        Helps style a DataFrame or Series according to the data with HTML and CSS.

    default_uuid : str
        If pandas.Styler uuid is not provided, this value will be used.

    """
    # pandas.Styler uuid should be set before _compute is called.
    _marshall_uuid(proto, styler, default_uuid)

    # We're using protected members of pandas.Styler to get styles,
    # which is not ideal and could break if the interface changes.
    styler._compute()

    # In Pandas 1.3.0, styler._translate() signature was changed.
    # 2 arguments were added: sparse_index and sparse_columns.
    # The functionality that they provide is not yet supported.
    if type_util.is_pandas_version_less_than("1.3.0"):
        pandas_styles = styler._translate()
    else:
        pandas_styles = styler._translate(False, False)

    _marshall_caption(proto, styler)
    _marshall_styles(proto, styler, pandas_styles)
    _marshall_display_values(proto, styler.data, pandas_styles)


def _marshall_uuid(proto: ArrowProto, styler: Styler, default_uuid: str) -> None:
    """Marshall pandas.Styler uuid into an Arrow proto.

    Parameters
    ----------
    proto : proto.Arrow
        Output. The protobuf for Streamlit Arrow proto.

    styler : pandas.Styler
        Helps style a DataFrame or Series according to the data with HTML and CSS.

    default_uuid : str
        If pandas.Styler uuid is not provided, this value will be used.

    """
    if styler.uuid is None:
        styler.set_uuid(default_uuid)

    proto.styler.uuid = str(styler.uuid)


def _marshall_caption(proto: ArrowProto, styler: Styler) -> None:
    """Marshall pandas.Styler caption into an Arrow proto.

    Parameters
    ----------
    proto : proto.Arrow
        Output. The protobuf for Streamlit Arrow proto.

    styler : pandas.Styler
        Helps style a DataFrame or Series according to the data with HTML and CSS.

    """
    if styler.caption is not None:
        proto.styler.caption = styler.caption


def _marshall_styles(proto: ArrowProto, styler: Styler, styles: Dict[str, Any]) -> None:
    """Marshall pandas.Styler styles into an Arrow proto.

    Parameters
    ----------
    proto : proto.Arrow
        Output. The protobuf for Streamlit Arrow proto.

    styler : pandas.Styler
        Helps style a DataFrame or Series according to the data with HTML and CSS.

    styles : dict
        pandas.Styler translated styles.

    """
    css_rules = []

    if "table_styles" in styles:
        table_styles = styles["table_styles"]
        table_styles = _trim_pandas_styles(table_styles)
        for style in table_styles:
            # styles in "table_styles" have a space
            # between the uuid and selector.
            rule = _pandas_style_to_css(
                "table_styles", style, styler.uuid, separator=" "
            )
            css_rules.append(rule)

    if "cellstyle" in styles:
        cellstyle = styles["cellstyle"]
        cellstyle = _trim_pandas_styles(cellstyle)
        for style in cellstyle:
            rule = _pandas_style_to_css("cell_style", style, styler.uuid)
            css_rules.append(rule)

    if len(css_rules) > 0:
        proto.styler.styles = "\n".join(css_rules)


def _trim_pandas_styles(styles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filter out empty styles.

    Every cell will have a class, but the list of props
    may just be [['', '']].

    Parameters
    ----------
    styles : list
        pandas.Styler translated styles.

    """
    return [x for x in styles if any(any(y) for y in x["props"])]


def _pandas_style_to_css(
    style_type: str,
    style: Dict[str, Any],
    uuid: str,
    separator: str = "",
) -> str:
    """Convert pandas.Styler translated style to CSS.

    Parameters
    ----------
    style_type : str
        Either "table_styles" or "cell_style".

    style : dict
        pandas.Styler translated style.

    uuid : str
        pandas.Styler uuid.

    separator : str
        A string separator used between table and cell selectors.

    """
    declarations = []
    for css_property, css_value in style["props"]:
        declaration = css_property.strip() + ": " + css_value.strip()
        declarations.append(declaration)

    table_selector = f"#T_{uuid}"

    # In pandas < 1.1.0
    # translated_style["cellstyle"] has the following shape:
    # [
    #   {
    #       "props": [["color", " black"], ["background-color", "orange"], ["", ""]],
    #       "selector": "row0_col0"
    #   }
    #   ...
    # ]
    #
    # In pandas >= 1.1.0
    # translated_style["cellstyle"] has the following shape:
    # [
    #   {
    #       "props": [("color", " black"), ("background-color", "orange"), ("", "")],
    #       "selectors": ["row0_col0"]
    #   }
    #   ...
    # ]
    if style_type == "table_styles" or (
        style_type == "cell_style" and type_util.is_pandas_version_less_than("1.1.0")
    ):
        cell_selectors = [style["selector"]]
    else:
        cell_selectors = style["selectors"]

    selectors = []
    for cell_selector in cell_selectors:
        selectors.append(table_selector + separator + cell_selector)
    selector = ", ".join(selectors)

    declaration_block = "; ".join(declarations)
    rule_set = selector + " { " + declaration_block + " }"

    return rule_set


def _marshall_display_values(
    proto: ArrowProto, df: DataFrame, styles: Dict[str, Any]
) -> None:
    """Marshall pandas.Styler display values into an Arrow proto.

    Parameters
    ----------
    proto : proto.Arrow
        Output. The protobuf for Streamlit Arrow proto.

    df : pandas.DataFrame
        A dataframe with original values.

    styles : dict
        pandas.Styler translated styles.

    """
    new_df = _use_display_values(df, styles)
    proto.styler.display_values = type_util.data_frame_to_bytes(new_df)


def _use_display_values(df: DataFrame, styles: Dict[str, Any]) -> DataFrame:
    """Create a new pandas.DataFrame where display values are used instead of original ones.

    Parameters
    ----------
    df : pandas.DataFrame
        A dataframe with original values.

    styles : dict
        pandas.Styler translated styles.

    """
    import re

    # If values in a column are not of the same type, Arrow
    # serialization would fail. Thus, we need to cast all values
    # of the dataframe to strings before assigning them display values.
    new_df = df.astype(str)

    cell_selector_regex = re.compile(r"row(\d+)_col(\d+)")
    if "body" in styles:
        rows = styles["body"]
        for row in rows:
            for cell in row:
                match = cell_selector_regex.match(cell["id"])
                if match:
                    r, c = map(int, match.groups())
                    new_df.iat[r, c] = str(cell["display_value"])

    return new_df


# Todo: does this work
# ArrowMixin._arrow_data_editor.configure_column = _configure_column
