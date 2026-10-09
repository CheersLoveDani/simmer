import { memo, useMemo, type CSSProperties } from 'react';
import { coverSpec, type Shape } from '../domain/cover';
import type { Recipe } from '../domain/schema';

function FoodShape({ shape }: { shape: Shape }) {
  switch (shape.t) {
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill ?? 'none'} stroke={shape.stroke} strokeWidth={shape.sw} />;
    case 'ellipse':
      return (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          transform={shape.rot ? `rotate(${shape.rot} ${shape.cx} ${shape.cy})` : undefined}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke}
          strokeWidth={shape.sw}
        />
      );
    case 'rect':
      return (
        <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} transform={shape.rot ? `rotate(${shape.rot})` : undefined} fill={shape.fill} />
      );
    case 'path':
      return (
        <path
          d={shape.d}
          transform={shape.tf}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke}
          strokeWidth={shape.sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
  }
}

interface Props {
  recipe: Pick<Recipe, 'id' | 'cover' | 'title'>;
  className?: string;
  style?: CSSProperties;
}

/** The plate-on-a-cloth artwork every recipe gets. Purely decorative. */
export const Cover = memo(function Cover({ recipe, className, style }: Props) {
  const spec = useMemo(() => coverSpec(recipe.id, recipe.cover), [recipe.id, recipe.cover]);
  const { plate } = spec;
  const well = plate.r * 0.72;
  return (
    <svg className={className} style={style} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-cover={recipe.id}>
      <rect width="400" height="300" fill={spec.cloth} />
      {spec.stripes.map((x) => (
        <rect key={x} x={x} width="5" height="300" fill={spec.clothShade} opacity="0.45" />
      ))}
      <ellipse cx={plate.cx + 5} cy={plate.cy + 9} rx={plate.r} ry={plate.r} fill={spec.clothShade} opacity="0.55" />
      <circle cx={plate.cx} cy={plate.cy} r={plate.r} fill="var(--plate)" stroke="var(--plate-rim)" strokeWidth="3.5" />
      <circle cx={plate.cx} cy={plate.cy} r={well} fill="none" stroke="var(--plate-well)" strokeWidth="1.5" />
      <g transform={`translate(${plate.cx} ${plate.cy}) scale(${well * 0.92})`}>
        {spec.food.map((shape, i) => (
          <FoodShape key={i} shape={shape} />
        ))}
      </g>
    </svg>
  );
});
