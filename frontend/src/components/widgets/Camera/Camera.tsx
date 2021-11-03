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

import React, { ReactElement, Component, useState, useRef } from "react"
import Webcam from "react-webcam"
import { CameraImageInput as CameraImageInputProto } from "src/autogen/proto"
import { WidgetStateManager } from "src/lib/WidgetStateManager"
import { ReportRunState } from "src/lib/ReportRunState"
import { CameraState } from "src/lib/CameraState"
import UIButton, {
  ButtonTooltip,
  Kind,
  Size,
} from "src/components/shared/Button"
import Icon from "src/components/shared/Icon"

export interface CameraProps {
  element: CameraImageInputProto
  widgetMgr: WidgetStateManager
  reportRunState: ReportRunState
}

function Camera({ element, widgetMgr, reportRunState }: CameraProps) {
  const webcamRef = useRef<Webcam>(null) as any
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [isTakingPhoto, setIsTakingPhoto] = useState<boolean>(true)
  // const isRunning = reportRunState === ReportRunState.RUNNING
  //   console.log(isRunning)
  console.log(element)
  console.log(widgetMgr)
  const capture = React.useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot()
    widgetMgr.setStringValue(element, imageSrc, { fromUi: true })
    setIsTakingPhoto(false)
    setImgSrc(imageSrc)
  }, [webcamRef, setImgSrc, isTakingPhoto])

  const clear = React.useCallback(() => {
    setImgSrc(null)
    setIsTakingPhoto(true)
  }, [setImgSrc, setIsTakingPhoto])

  return (
    <>
      {isTakingPhoto && (
        <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" />
      )}
      {isTakingPhoto && (
        <ButtonTooltip help={element.help}>
          <UIButton kind={Kind.PRIMARY} size={Size.SMALL} onClick={capture}>
            {" "}
            Capture
          </UIButton>
        </ButtonTooltip>
      )}
      {!isTakingPhoto && imgSrc && <img src={imgSrc} />}
      {!isTakingPhoto && (
        <ButtonTooltip help={element.help}>
          <UIButton kind={Kind.PRIMARY} size={Size.SMALL} onClick={clear}>
            {" "}
            Clear
          </UIButton>
        </ButtonTooltip>
      )}
    </>
  )
}

export default Camera
