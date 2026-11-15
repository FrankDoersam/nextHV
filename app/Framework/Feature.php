<?php

namespace App\Framework;

enum Feature: string
{
    case Search = 'search';
    case Import = 'import';
    case Audit = 'audit';
}
