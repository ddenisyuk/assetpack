import sharp from 'sharp';
import { checkExt, createNewAssetAt } from '../core/index.js';
import { compressSharp } from './utils/compressSharp.js';
import { resolveOptions } from './utils/resolveOptions.js';
import { generate } from 'gpu-tex-enc';
import * as cpu from 'cpu-features';

import type { AvifOptions, JpegOptions, PngOptions, WebpOptions } from 'sharp';
import type { Asset, AssetPipe, PluginOptions } from '../core/index.js';
import type { OutputOptions } from 'gpu-tex-enc';

type CompressJpgOptions = Omit<JpegOptions, 'force'>;
type CompressWebpOptions = Omit<WebpOptions, 'force'>;
type CompressAvifOptions = Omit<AvifOptions, 'force'>;
type CompressPngOptions = Omit<PngOptions, 'force'>;
type CompressGpuOptions = Omit<OutputOptions, 'force'>;

export interface CompressOptions extends PluginOptions
{
    png?: CompressPngOptions | boolean;
    webp?: CompressWebpOptions | boolean;
    avif?: CompressAvifOptions | boolean;
    jpg?: CompressJpgOptions | boolean;
    gpu?: CompressGpuOptions | boolean;
}

export interface CompressImageData
{
    format: '.avif' | '.png' | '.webp' | '.jpg' | '.jpeg';
    resolution: number;
    sharpImage: sharp.Sharp;
}

export function compress(options: CompressOptions = {}): AssetPipe<CompressOptions, 'nc'>
{
    const compress = resolveOptions<CompressOptions>(options, {
        png: true,
        jpg: true,
        webp: true,
        avif: false,
        gpu: false,
    });

    if (compress)
    {
        compress.jpg = resolveOptions<CompressJpgOptions>(compress.jpg, {

        });
        compress.png = resolveOptions<CompressPngOptions>(compress.png, {
            quality: 90,
        });
        compress.webp = resolveOptions<CompressWebpOptions>(compress.webp, {
            quality: 80,
            alphaQuality: 80,
        });
        compress.avif = resolveOptions<CompressAvifOptions>(compress.avif, {

        });

        compress.gpu = resolveOptions<CompressGpuOptions>(compress.gpu, {
            // ASTC: {
            //     blocksize: '4x4',
            //     quality: 'exhaustive'
            // },
            BC7: {}
        });
    }

    return {
        folder: true,
        name: 'compress',
        defaultOptions: {
            ...compress,
        },
        tags: {
            nc: 'nc',
        },
        test(asset: Asset, options)
        {
            return options && checkExt(asset.path, '.png', '.jpg', '.jpeg') && !asset.allMetaData[this.tags!.nc];
        },
        async transform(asset: Asset, options)
        {
            const shouldCompress = compress && !asset.metaData.nc;

            if (!shouldCompress)
            {
                return [];
            }

            try
            {
                const image: CompressImageData = {
                    format: asset.extension as CompressImageData['format'],
                    resolution: 1,
                    sharpImage: sharp(asset.buffer),
                };

                const processedImages = await compressSharp(image, options);

                const newAssets = processedImages.map((data) =>
                {
                    const end = `${data.format}`;
                    const filename = asset.filename
                        .replace(/\.[^/.]+$/, end);

                    const newAsset = createNewAssetAt(
                        asset,
                        filename
                    );

                    return newAsset;
                });
                // GPU
                console.error("!!!!!gpu in", cpu.default(), compress.gpu);
                if (false) {
                    // const gpu = await generate(asset.path, compress.gpu as CompressGpuOptions);
                }
                // if (false) {
                //     if (checkExt(asset.path, '.png')) {
                //         console.error("!!!!!gpu NOOOOO");
                //
                //         const gpu = await generate(asset.path, "" as CompressGpuOptions);
                //     }
                //     // const gpu = await gpuEnc.generate(asset.path, compress.gpu as CompressGpuOptions);
                // }
                const promises = processedImages.map((image, i) => image.sharpImage.toBuffer().then((buffer) =>
                {
                    newAssets[i].buffer = buffer;
                }));

                await Promise.all(promises);

                return newAssets;
            }
            catch (error)
            {
                throw new Error(`[AssetPack][compress] Failed to compress image: ${asset.path} - ${error}`);
            }
        },

    };
}

