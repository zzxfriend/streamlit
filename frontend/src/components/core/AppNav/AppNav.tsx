/**
 * @license
 * Copyright 2018-2022 Streamlit Inc.
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

import React, { ReactElement } from "react"

import { ChevronDown } from "baseui/icon"

import { StatefulPopover, PLACEMENT, TRIGGER_TYPE } from "baseui/popover"

import { IAppPage } from "src/autogen/proto"

import {
  StyledNavButton,
  StyledPageList,
  StyledPageItem,
  StyledPageItemLabel,
  StyledLink,
} from "./styled-components"

export interface Props {
  pages?: IAppPage[]
  currentPage?: string
}

function renderPages(pages?: IAppPage[], currentPage?: string): ReactElement {
  pages = pages || [
    { scriptPath: "localhost/mainapp", pageName: "this is a page" },
  ]
  const pageItems = pages.map((page, idx) => {
    const disabled = currentPage === page.pageName
    return (
      <StyledPageItem
        key={page.pageName}
        isMainPage={idx === 0}
        isDisabled={disabled}
      >
        <StyledLink href={page.pageName ? page.pageName : ""}>
          <StyledPageItemLabel>{page.pageName}</StyledPageItemLabel>
        </StyledLink>
      </StyledPageItem>
    )
  })

  return <StyledPageList isDisabled={false}>{pageItems}</StyledPageList>
}

function AppNavMenu(props: Props): ReactElement {
  const { pages, currentPage } = props
  const renderMenu = pages && pages.length > 1

  return (
    <>
      {/* {renderMenu && (<StatefulPopover
        content={renderPages(pages, currentPage)}
        placement={PLACEMENT.bottomLeft}
        triggerType={TRIGGER_TYPE.hover}
        focusLock
        autoFocus
      >
        <StyledNavButton>
          {currentPage}
          <ChevronDown size={24} />
        </StyledNavButton>
      </StatefulPopover>) }
      {!renderMenu && <StyledNavButton>
          {currentPage}
        </StyledNavButton>} */}
      <StatefulPopover
        content={renderPages(pages, currentPage)}
        placement={PLACEMENT.bottomLeft}
        triggerType={TRIGGER_TYPE.hover}
        focusLock
        autoFocus
      >
        <StyledNavButton>
          {currentPage}
          <ChevronDown size={24} />
        </StyledNavButton>
      </StatefulPopover>
    </>
  )
}

export default AppNavMenu
