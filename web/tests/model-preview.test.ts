import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModelPreview} from '../src/components/Media';
import type {Asset} from '../src/core/types';

const asset={id:'part',name:'Part',preview:'part.png',model:'part.glb'} as Asset;
test('part detail opens the full preview area as 3D with Reset and no image switch',()=>{
 const html=renderToStaticMarkup(createElement(ModelPreview,{buildId:'build',asset,interactiveOnly:true}));
 assert.match(html,/model-canvas/);
 assert.match(html,/>Reset view</);
 assert.doesNotMatch(html,/<img|>Image<|>Rotate model</);
});
test('plate preview retains its existing image and model switch',()=>{
 const html=renderToStaticMarkup(createElement(ModelPreview,{buildId:'build',asset}));
 assert.match(html,/<img/);
 assert.match(html,/>Image</);
 assert.match(html,/>Rotate model</);
});
test('a part without a model has an empty preview and disabled Reset without a still image',()=>{
 const html=renderToStaticMarkup(createElement(ModelPreview,{buildId:'build',asset:{...asset,model:undefined},interactiveOnly:true}));
 assert.match(html,/Preview not available/);
 assert.match(html,/<button disabled="">Reset view</);
 assert.doesNotMatch(html,/<img|model-canvas/);
});
