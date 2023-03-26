import { useParams } from 'react-router-dom';

import { jenks } from '../jenks';

import { timeFormat } from "d3-time-format";
import prettyMilliseconds from 'pretty-ms';

import { ParentSize } from '@visx/responsive';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { localPoint } from '@visx/event';
import { LinePath } from "@visx/shape";
import { GlyphCircle } from "@visx/glyph";
import { Grid } from '@visx/grid';
import { Brush } from "@visx/brush";
import { PatternLines } from '@visx/pattern';
import * as Scale from "@visx/scale";
import { Annotation, CircleSubject, HtmlLabel, Connector } from "@visx/annotation";
import { Group } from "@visx/group";
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Bounds } from '@visx/brush/lib/types';
import BaseBrush from '@visx/brush/lib/BaseBrush';
import { Text } from '@visx/text';
import { curveLinear } from '@visx/curve';
import { useTheme } from 'styled-components';
import { BrushHandleRenderProps } from '@visx/brush/lib/BrushHandle';

export type BrushProps = {
    margin?: { top: number; right: number; bottom: number; left: number };
};

export default function Timeline({
    margin = {
        top: 20,
        left: 100,
        bottom: 20,
        right: 20,
    },
}: BrushProps) {
    return (
        <div style={{ flex: "1" }}>
            <ParentSize>
                {({ width, height }) => (
                    <Chart width={width} height={height} margin={margin} />
                )}
            </ParentSize>
        </div>
    );
}

const Undef = {
    map<T, R>(x: T | undefined, fn: (_: T) => R): R | undefined {
        if (x !== undefined) {
            return fn(x);
        } else {
            return undefined;
        }
    },
    orElse<T>(x: T | undefined, or: T): T {
        if (x !== undefined) {
            return x;
        } else {
            return or;
        }
    }
};

const interpolatePoints = (x: number, y0: number, y1: number, x0: number, x1: number) => {
    return y0 + ((x - x0) * (y0 - y1)) / (x0 - x1)
}

type Data = { date: string, timeDelta: number, description: string, frozen: boolean };
type ExpandedData = { date: Date, time: number };

type Theme = {
        color: {
            accent1: string,
            accent2: string,
            warm: string,
            cold1: string,
            cold2: string,
            white: string,
        },
    };

function Chart({
    height = 100,
    width = 100,
    brushWidth = 100,
    margin = {
        top: 20,
        left: 20,
        bottom: 20,
        right: 20,
    },
}) {
    if (height === 0 || width === 0) return <></>;

    const theme: Theme = useTheme() as Theme;

    const brushRef = useRef<BaseBrush | null>(null);

    const { timeline } = useParams();

    const expandData = (data: Data[]) => (
        [...data, { date: new Date(Date.now()).toString(), timeDelta: 0, frozen: false }].reduce<ExpandedData[]>((c, d) => {
            const last: ExpandedData | undefined = c[c.length - 1];
            let lastTime;

            if (d.frozen) {
                lastTime = Undef.orElse(Undef.map(last, l => l.time), 0);
            } else {
                lastTime = Undef.orElse(Undef.map(last, l => l.time - (Date.parse(d.date) - l.date.getTime()) / 1000), 0);
            }

            const zeroPoint = last == undefined || lastTime >= 0 ? [] : [
                {
                    date: new Date(last.date.getTime() + last.time * 1000),
                    time: 0,
                },
            ];

            return [
                ...c,
                ...zeroPoint,
                {
                    date: new Date(Date.parse(d.date)),
                    time: Math.max(last ? lastTime : d.timeDelta, 0),
                },
                {
                    date: new Date(Date.parse(d.date)),
                    time: Math.max(lastTime + d.timeDelta, 0),
                },
            ];
        }, [])
    );

    const events: Data[] = useMemo(() => {
        return JSON.parse(atob(timeline || ""));
    }, [timeline]);

    const data: ExpandedData[] = useMemo(() => {
        return expandData(events);
    }, [events]);

    const [yOffset, setYOffest] = useState(0);
    const [yScaleFactor, setYScaleFactor] = useState(2);

    const x = (d: typeof data[0]) => d.time / 60 / 60 / 24;
    const y = (d: typeof data[0]) => d.date.getTime();

    const onBrushChange = (domain: Bounds | null) => {
        if (!domain) return;

        const { y0, y1 } = domain;

        setYOffest(y0);
        setYScaleFactor(height / (y1 - y0));
    };

    const xScale = Scale.scaleLinear({
        domain: [Math.min(0, ...data.map(x)), Math.max(...data.map(x))],
        range: [0, width - brushWidth - margin.left - margin.right],
        round: false,
    });

    const yScale = useMemo(
        () => Scale.scaleTime({
            domain: [Math.min(...data.map(y)), Math.max(...data.map(y))],
            range: [0, height * yScaleFactor],
            round: false,
        }),
        [yScaleFactor]
    );

    const xScaleBrush = Scale.scaleLinear({
        domain: [Math.min(...data.map(x)), Math.max(...data.map(x))],
        range: [0, brushWidth],
        round: false,
    });

    const yScaleBrush = Scale.scaleLinear({
        domain: [Math.min(...data.map(y)), Math.max(...data.map(y))],
        range: [0, height],
        round: false,
    });

    const initialBrushPosition = useMemo(() => ({
        start: { y: yOffset },
        end: { y: height / yScaleFactor + yOffset },
    }), [yOffset, yScaleFactor]);

    const numTicksX = 16;
    const numTicksY = useMemo(() => 10 * yScaleFactor, [yScaleFactor]);

    const continuousX = (yVal: number) => {
        const idx = data.findIndex(d => y(d) > yVal);

        if (idx <= 0 || idx >= data.length) return null;

        return interpolatePoints(yVal, x(data[idx - 1]), x(data[idx]), y(data[idx - 1]), y(data[idx]))
    }

    const [hoverX, setHoverX] = useState(110);
    const [hoverY, setHoverY] = useState(110);

    const [mouseX, setMouseX] = useState(110);
    const [mouseY, setMouseY] = useState(110);

    const mouseMove = (e: React.TouchEvent | React.MouseEvent) => {
        const point = localPoint(e);

        if (!point) return;

        setMouseX(point.x - margin.left);
        setMouseY(point.y - margin.top + yOffset * yScaleFactor);

        const y = yScale.invert(point.y - margin.top + yOffset * yScaleFactor).getTime();
        const x = continuousX(y);

        if (x === null) return;

        setHoverX(xScale(x));
        setHoverY(yScale(y));
    };

    const joinOverlapping = (scale: number, [centroids, clusters]: [number[], Data[][]]) => {
        let localCentroids = centroids;
        let localClusters = clusters;
        let done = false;
        let minDist = 100000 * scale;

        while (!done) {
            done = true;

            for (let i = 0; i < localCentroids.length - 1; i++) {
                if (Math.abs(localCentroids[i] - localCentroids[i + 1]) < minDist) {
                    done = false;

                    const centroid = (localClusters[i].reduce((c, x) => Date.parse(x.date) + c, 0) + localClusters[i + 1].reduce((c, x) => Date.parse(x.date) + c, 0)) / (localClusters[i].length + localClusters[i + 1].length);

                    localCentroids = [
                        ...localCentroids.slice(0, i),
                        centroid,
                        ...localCentroids.slice(i + 2, -1),
                    ];

                    localClusters = [
                        ...localClusters.slice(0, i),
                        [...localClusters[i], ...localClusters[i + 1]],
                        ...localClusters.slice(i + 2, -1),
                    ];
                }
            }
        }

        return [localCentroids, localClusters] as [number[], Data[][]];
    };

    const filteredEvents: [number[], Data[][]] = useMemo(() => {
        const lower = yScale.invert(0 - margin.top + yOffset * yScaleFactor).getTime();
        const upper = yScale.invert(height - margin.top + yOffset * yScaleFactor).getTime();

        const inRange = events.filter(e => {
            const eventDate = Date.parse(e.date);

            return eventDate >= lower && eventDate <= upper
        });

        if (inRange.length > 24) {
            const clusters: Data[][] = new Array(10).fill(0).map(() => []);

            const centroids = jenks(inRange.map(e => Date.parse(e.date)), clusters.length - 1);

            for (const event of inRange) {
                const [_, nearest] = centroids.reduce(([min, c], centroid) => {
                    const dist = Math.abs(centroid - Date.parse(event.date));

                    return dist < min ? [dist, centroid] : [min, c];
                }, [Math.abs(Date.parse(event.date) - centroids[0]), centroids[0]]);

                clusters[centroids.indexOf(nearest)].push(event);
            }

            return joinOverlapping(yScaleFactor, [centroids, clusters]);
        } else {
            const clusters: Data[][] = new Array(inRange.length).fill(0).map(() => []);
            inRange.forEach((event, i) => clusters[i].push(event));

            return joinOverlapping(yScaleFactor, [inRange.map(e => Date.parse(e.date)), clusters]);
        }
    }, [events, yScale, yScaleFactor]);

    const [showDetails, setShowDetails] = useState(true);

    const hideDetailChange = (e: ChangeEvent<Element & { checked: boolean }>) => {
        setShowDetails(!e.target.checked);
    };

    const onScroll = (e: WheelEvent) => {
        if (e.ctrlKey == true) {
            brushRef.current?.updateBrush(prev => {
                const extent = brushRef.current!.getExtent(
                    { y: prev.extent.y0 },
                    { y: Math.min(height, prev.extent.y0 + (prev.extent.y1 - prev.extent.y0) * (1 + 0.05 * (e.deltaY / Math.abs(e.deltaY)))) },
                );

                return {
                    ...prev,
                    start: { x: extent.x0, y: extent.y0 },
                    end: { x: extent.x1, y: extent.y1 },
                    extent,
                };
            });

            return e.preventDefault();
        } else {
            brushRef.current?.updateBrush(prev => {
                const h = prev.extent.y1 - prev.extent.y0;
                const y = Math.min(height - h, Math.max(0, prev.extent.y0 + e.deltaY / yScaleFactor));

                const extent = brushRef.current!.getExtent(
                    { y: y },
                    { y: y + h },
                );

                return {
                    ...prev,
                    start: { x: extent.x0, y: extent.y0 },
                    end: { x: extent.x1, y: extent.y1 },
                    extent,
                };
            })
        }
    };

    const annotationRadius = 16;

    const hoveredAnnotation = useMemo(() => filteredEvents[0].map((c, i) => [c, i]).filter(([_, i]) => filteredEvents[1][i].length > 0).map(([centroid, i]) => {
        const x = xScale(continuousX(centroid) || 0);
        const y = yScale(centroid);

        const hovered = ((mouseX - x) * (mouseX - x) + (mouseY - y) * (mouseY - y)) < annotationRadius * annotationRadius;

        return {
            hovered,
            i,
        };
    }).find(r => r.hovered), [filteredEvents, mouseX, mouseY]);

    return (
        <svg style={{ background: theme.color.white }} width={width} height={height} onMouseMove={mouseMove} onWheel={onScroll}>
            <Group
                left={margin.left}
                top={margin.top}
            >
                <Group
                    top={-yOffset * yScaleFactor}
                >
                    <Grid
                        xScale={xScale}
                        yScale={yScale}
                        width={width}
                        height={height * yScaleFactor}
                        numTicksRows={numTicksY}
                        numTicksColumns={numTicksX}
                        stroke={theme.color.cold2}
                    />
                    <LinePath
                        curve={curveLinear}
                        stroke={theme.color.warm}
                        strokeWidth={3}
                        data={data}
                        x={d => xScale(x(d))}
                        y={d => yScale(y(d))}
                    />
                    <GlyphCircle
                        stroke={theme.color.cold1}
                        fill={theme.color.cold1}
                        left={hoverX}
                        top={hoverY}
                    />
                    <AxisLeft tickLineProps={{fill: theme.color.cold1}} tickLabelProps={{fill: theme.color.cold1}} stroke={theme.color.cold1} scale={yScale} numTicks={numTicksY} />
                </Group>
                <AxisBottom tickLineProps={{fill: theme.color.cold1}} tickLabelProps={{fill: theme.color.cold1}} stroke={theme.color.cold1} hideZero={true} numTicks={numTicksX} top={height - margin.top - margin.bottom - 40} scale={xScale} />
            </Group>
            <Text
                verticalAnchor="start"
                x={width * 0.7 - margin.right}
                y={height * 0.85 - margin.bottom}
                stroke={theme.color.cold1}
                style={{ fontWeight: 1 }}
                width={(width - brushWidth) - (width * 0.7 - margin.right)}
            >
                {`locked for ${prettyMilliseconds(yScale.invert(hoverY).getTime() - Date.parse(events[0].date), { secondsDecimalDigits: 0, compact: !showDetails })} with ${prettyMilliseconds(xScale.invert(hoverX) * 24 * 60 * 60 * 1000, { secondsDecimalDigits: 0, compact: !showDetails })} left on ${timeFormat("%B %d, %Y")(yScale.invert(hoverY))}` + (showDetails ? ` at ${timeFormat("%I:%M %p")(yScale.invert(hoverY))}` : '')}
            </Text>
            <foreignObject y={margin.top} x={width * 0.75 - margin.right} width={200} height={200}>
                <input type="checkbox" checked={!showDetails} onChange={hideDetailChange}></input><span style={{color: theme.color.cold1}}> Hide details</span>
            </foreignObject>
            <Group
                left={margin.left}
                top={margin.top - yOffset * yScaleFactor}
            >
                {!showDetails ? <></> : filteredEvents[0].map((c, i) => [c, i]).filter(([_, i]) => filteredEvents[1][i].length > 0).map(([centroid, i]) => {
                    const x = xScale(continuousX(centroid) || 0);
                    const y = yScale(centroid);

                    const hovered = i == hoveredAnnotation?.i;

                    const subtitles = hovered ?
                        filteredEvents[1][i].map(e => e.description) :
                        [filteredEvents[1][i][0].description + (filteredEvents[1][i].length > 1 ? '\n\n[...]' : '')];

                    const xMid = (margin.left + width - margin.right) / 2;

                    return {
                        hovered,
                        subtitles,
                        flip: x < xMid ? 1 : -1,
                        x,
                        y,
                        i,
                    };
                }).map(annotation => (
                    <Annotation
                        key={annotation.i}
                        x={annotation.x}
                        y={annotation.y}
                        dx={annotation.flip * 35}
                        dy={15}
                    >
                        {(annotation.hovered || hoveredAnnotation === undefined) ? (
                            <>
                                <Connector type={"elbow"} stroke={theme.color.cold1} />
                                <CircleSubject stroke={theme.color.cold1}/>
                                <HtmlLabel anchorLineStroke={theme.color.cold1}>
                                    <div style={{ padding: 5, width: width * 0.3, borderRadius: 3, borderStyle: "solid", borderWidth: "1px", borderColor: theme.color.cold1, background: theme.color.white }}>
                                        {annotation.subtitles.map((sub, i) => <div style={{ marginBottom: 7 }} key={i}>{sub}</div>)}
                                    </div>
                                </HtmlLabel>
                            </>
                        ) : (
                            <CircleSubject />
                        )}
                    </Annotation>
                ))}
            </Group>
            <Group
                left={width - brushWidth}
            >
                <rect
                    width={brushWidth}
                    height={height}
                    fill={theme.color.cold1}
                    strokeWidth={3}
                />
                <LinePath
                    stroke={theme.color.warm}
                    strokeWidth={3}
                    data={data}
                    x={d => xScaleBrush(x(d))}
                    y={d => yScaleBrush(y(d))}
                />
                <PatternLines
                    id="brush_pattern"
                    height={8}
                    width={8}
                    stroke={theme.color.cold2}
                    strokeWidth={1}
                    orientation={['diagonal']}
                />
                <Brush
                    initialBrushPosition={initialBrushPosition}
                    handleSize={8}
                    xScale={Scale.scaleLinear({
                        domain: [0, 0],
                        range: [0, 0],
                        round: false,
                    })}
                    yScale={Scale.scaleLinear({
                        domain: [0, height],
                        range: [-2, height + 2],
                        round: false,
                    })}
                    innerRef={brushRef}
                    width={brushWidth}
                    height={height}
                    onChange={onBrushChange}
                    useWindowMoveEvents={true}
                    brushDirection="vertical"
                    resizeTriggerAreas={['top', 'bottom']}
                    selectedBoxStyle={{
                        fill: 'url(#brush_pattern)',
                        stroke: theme.color.cold2,
                    }}
                    renderBrushHandle={(props) => <BrushHandle {...props} y={props.y} />}
                />
            </Group>
        </svg>
    );
}

// We need to manually offset the handles for them to be rendered at the right position
function BrushHandle({ y, isBrushActive, width }: BrushHandleRenderProps) {
    if (!isBrushActive) {
        return null;
    }

    return (
        <Group left={6 + width / 2} top={4 + y}>
            <path
                fill="#f2f2f2"
                d="M -4.5 0.5 L 3.5 0.5 L 3.5 15.5 L -4.5 15.5 L -4.5 0.5 M -1.5 4 L -1.5 12 M 0.5 4 L 0.5 12"
                stroke="#999999"
                strokeWidth="1"
                style={{ transform: "rotate(90deg)", cursor: 'ns-resize' }}
            />
        </Group>
    );
}